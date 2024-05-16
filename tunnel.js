//================================================================
//#region Requirements

console.clear();
console.log('================================================================');
const axios = require('axios');
const { Stream } = require('stream');
const WebSocket = require('ws');
const StatArray = require('./StatArray.js');
const tunnelConfig = require('./config_tunnel.json');
const appModule = require(tunnelConfig.module);

//#endregion

//================================================================
//#region Vars 

//stream
let httpStream = null;
let info = null;

//#endregion

//================================================================
//#region Time Stats

const requestTimeBuffer = new StatArray(tunnelConfig.requestTimeBufferCount);
const responseTimeBuffer = new StatArray(tunnelConfig.responseTimeBufferCount);

//#endregion

//================================================================
//#region Functions

const ParseJSON = (data) => {
    try{
        return JSON.parse(data);
    }
    catch(e){
        return null;
    }
};

const GetHTTPaddress = () => {
    let url = '';
    //SSL
    if(ProfileProp('useSSL'))
        url = 'https://';
    else
        url = 'http://';
    
    //return
    url += ProfileProp('address');
    return url;
};

const GetWSaddress = () => GetHTTPaddress().replace('http', 'ws');

const GetTunnelHTTPaddress = () => {
    let url = GetHTTPaddress();
    //rest
    url += '/tunnel/';
    //init JSON
    const json = {
        type: appModule.applicationType
        ,description: tunnelConfig.description
    };
    //password or key
    if(ProfileProp('key'))
        json.key = ProfileProp('key');
    else
        json.password = ProfileProp('password');
    //timestamp
    json.time = new Date().getTime(); 
    //add json
    return url + encodeURI(JSON.stringify(json));
};

//----------------------------------------------------------------
//For connected situations

const GetRefreshHTTPstreamAddress = () => GetHTTPaddress() + '/refresh/' + encodeURIComponent(JSON.stringify({
    key: info.key
    ,time: new Date().getTime()
}));

//#endregion

//================================================================
//#region Profiles

let currentProfile = null;
let currentProfileIndex = -1;

const ProfileProp = (name) => {
    const result = currentProfile[name];
    if(result !== undefined)
        return result;
    return tunnelConfig[name];
};

const NextProfile = () => {
    currentProfileIndex++;
    if(currentProfileIndex >= tunnelConfig.tunnels.length)
        currentProfileIndex = 0;
    currentProfile = tunnelConfig.tunnels[currentProfileIndex];
    //clear stats
    requestTimeBuffer.Reset();
    responseTimeBuffer.Reset();
};
NextProfile();

//#endregion

//================================================================
//#region HTTP Stream Managment

let isRefreshing = false;
let isGreenLightWS = false;

const SetHTTPstream = (res) => {
    //close the current stream
    if(httpStream){
        httpStream.destroy();
    }

    //close totally because of the error
    if(res == null){
        console.log('Closing due to error');
        //mark vars responsible for further closing.
        isRefreshing = false;
        isGreenLightWS = false;
        if(httpStream){
            httpStream.destroy();
            httpStream = null;
        }
        NextConnection();
        return;
    }

    //create new stream
    httpStream = new Stream.PassThrough();

    //message
    httpStream.on('data', (chunk) => {
        const data = ParseJSON(chunk.toString());
        const currentTime = new Date().getTime();
        //object - config or error
        if(typeof(data) == 'object'){
            //JSON - config or refresh
            if(data){
                //register responseTime
                responseTimeBuffer.Register(currentTime - data.time);
                //register requestTime
                if(!isNaN(data.requestTime)){
                    //console.log(data.requestTime);
                    requestTimeBuffer.Register(data.requestTime);
                }
                //check if config
                if(data.key){
                    //change config
                    info = data;
                    console.log(info);
                    //set timeout
                    SetTimeoutRefreshHTTPConnection(data.time);
                }
                else{
                    //refresh
                    //console.log('by refresh');
                    SetTimeoutRefreshHTTPConnection(data.time);
                }
            }
            //something else
            else{
                //something else always indicate that something went wrong
                //log
                console.log("Unknown data:", chunk.toString());
                //safely close connection
                //The simplest solution would be just to restart the connection
                console.log("Must be error.");
                TerminateHTTPConnection();
                RestartConnection();
            }
        }
        //number - controll message
        else if(typeof(data) == 'number'){
            //console.log(data);
            //register responseTime
            responseTimeBuffer.Register(currentTime - data);
        }
        //number - controll message
        else if(typeof(data) == 'string'){
            if(data == 'OK'){
                //end this stream with the green light to tunnel the service
                isGreenLightWS = true;
                httpStream.end();
            }
        }
    });

    //end
    httpStream.on('end', () => {
        //console.log('Stream ended');
        RemoveTimeoutRefreshHTTPConnection();
        if(isGreenLightWS){
            TunnelService(info.address);
        }
        else if(isRefreshing){
            isRefreshing = false;
            //console.log("Closed by refresh...");
        }
        else{
            console.log("No success, no money!!!");
            NextConnection();
        }
    });

    //error
    httpStream.on('error', (error) => {
        console.error('Stream error:', error);
        NextConnection();
    });

    //pipe
    res.data.pipe(httpStream);
};

const RefreshHTTPConnection = () => {
    isRefreshing = true;
    axios.get(GetRefreshHTTPstreamAddress(), { responseType: 'stream' })
        .then((res) => {
            SetHTTPstream(res);
        })
        .catch((error) => {
            console.error('Error:', error);
            //ECONNREFUSED
            SetHTTPstream(null);
        });
};

const RestartConnection = () => {
    //change the green light to none
    isGreenLightWS = false;
    isRefreshing = false;
    //remove data
    info = null;
    //call
    axios.get(GetTunnelHTTPaddress(), { responseType: 'stream' })
        .then((res) => {
            SetHTTPstream(res);
        })
        .catch((error) => {
            console.log("Error:",error);
            SetHTTPstream(null);
        });
};

const NextConnection = async () => {
    console.log('Next profile.');
    //close WebSocket
    if(socket){
        socket.close();
        socket = null;
    }
    //vars
    isGreenLightWS = false;
    isRefreshing = false;
    info = null;
    //Remove refresh event
    RemoveTimeoutRefreshHTTPConnection();
    //switch profile
    NextProfile();
    //restart connection
    setTimeout(RestartConnection, tunnelConfig.reconnectTime);
};

const TerminateHTTPConnection = () => httpStream.removeAllListeners();

//#endregion 

//================================================================
//#region HTTP Stream Refresh

let eventId_RefreshConnection = null;
const RemoveTimeoutRefreshHTTPConnection = () => clearTimeout(eventId_RefreshConnection);
const SetTimeoutRefreshHTTPConnection = (responseTime) => {
    const time = info.maxIdleTime - ((new Date().getTime() - responseTime) + requestTimeBuffer.GetAvarage() + ProfileProp('timeBeforeRefresh'));
    if(isNaN(time)){
        console.log(requestTimeBuffer);
        console.log("GOTCHAAAA!!!");
        process.exit(0);
        return;
    }
    //log
    //console.log("Refresh set to launch in", time / 1000, "seconds");
    //remove the old one
    RemoveTimeoutRefreshHTTPConnection();
    //create a new one
    eventId_RefreshConnection = setTimeout(RefreshHTTPConnection, time);
};

//#endregion

//================================================================
//#region HTTP Stream Response delay check

//#endregion

//================================================================
//#region WS connection

let socket = null;

const TunnelService = (address) => {
    console.log("Starting to tunnel through:", address);
    socket = new WebSocket(address);
    SetupSocketEvents();
};

const SetupSocketEvents = () => {
    //open
    socket.on('open', () => {
        appModule.onStart();
    });
    //close
    socket.on('close', () => {
        socket = null;
        appModule.onEnd();
        onTunnelServiceEnd();
    });

    //message
    socket.on('message', (message) => {
        appModule.onMessage(message);
    });
};

//just a procedure on what to do when the WS connection will end
const onTunnelServiceEnd = () => {
    RestartConnection();
};

const SendForAppModule = (message) => {
    if(socket)
        socket.send(message);
};
const CloseForAppModule = () => {
    if(socket)
        socket.close();
};
appModule.Init(SendForAppModule, CloseForAppModule);

//#endregion

//================================================================
//#region Start

RestartConnection();

//#endregion