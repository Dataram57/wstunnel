//================================================================
//#region requirements

console.clear();
const http = require('http');
const WebSocket = require('ws');
const config = require('./config_relay.json');

//#endregion

//================================================================
//#region Functions

const isLeftEqual = (target, base) => base == target.substring(0, base.length);

const parseJSONfromURL = (url) => {
    try{
        return JSON.parse(decodeURIComponent(url.substring(url.lastIndexOf('/') + 1)));
    }
    catch(e){
        return null;
    }
};

const GenerateKey = (length) => {
    let key = '';
    while(length-- > 0)
        key += String.fromCharCode(65 + Math.floor(25 * Math.random()));
    return key;
};

//#endregion

//================================================================
//#region Session Managment

const TunnelSession = class {
    constructor(key){
        //array info
        this.i = 0;
        //Tunnel info
        this.description = '';
        this.type = '';
        this.ip = '';
        //Listening
        this.res = null;
        //WS transfer
        if(key)
            this.key = key;
        else
            this.key = GenerateTunnelKey();
        this.client = null;
        this.server = null;
        //Life check
        this.lastMessage = new Date();
    }

    Refresh(newResponse, reqTime){
        if(this.res){
            //end the current assigned HTTP stream
            this.res.end();
            //prepare the new session
            newResponse.writeHead(200, HTTPstreamHead);
            //replace
            this.res = newResponse;
            //update info
            this.lastMessage = new Date();
            //send info back
            this.res.write(JSON.stringify({requestTime: reqTime, time: new Date().getTime()}));
        }
        else{
            //
            console.log('Very malicious behaviour!!!');
            newResponse.end();
            this.Kill();
        }
    }

    //will also eliminate nulls on the top of the "stack"
    Kill(){
        //remove from array
        if(this.i > -1){
            tunnels[this.i] = null;
            let i = tunnels.length;
            while(--i > -1)
                if(tunnels[i] == null)
                    tunnels.pop();
                else
                    break;
            this.i = -1;
        }
        //kill HTTP info stream
        if(this.res){
            this.res.end();
            this.res = null;
        }
        //kill WS connection
        if(this.client){
            this.client.close();
            this.client = null;
        }
        if(this.server){
            this.server.close();
            this.server = null;
        }
    }

    LifeCheck(){
        //check delay
        if(new Date() - this.lastMessage > config.profile.maxIdleTime)
            this.Kill();
    }

    ControlMessage(){
        if(this.res)
            this.res.write(new Date().getTime().toString());
    }
};

const tunnels = [];

const GenerateTunnelKey = () => {
    let key = '';
    let i = 0;
    while(true){
        key = GenerateKey(config.profile.keyLength);    
        i = tunnels.length;
        while(--i > -1)
            if(tunnels[i])
                if(tunnels[i].key == key)
                    break;
        if(i > -1)
            continue;
        return key;
    }
};

//gonna find first null and replace it
//else will make a space
const RegisterTunnelSession = (ts) => {
    let i = 0;
    for(i = 0; i < tunnels.length; i++)
        if(tunnels[i] == null){
            tunnels[i] = ts;
            return i;
        }
    tunnels.push(ts);
    return i;
};

const FindTunnelSession = (key) => {
    let i = tunnels.length;
    while(--i > -1)
        if(tunnels[i])
            if(tunnels[i].key == key)
                return tunnels[i];
    return null;
};

//just creates a registered tunnel
const CreateNewTunnelSession = (type, description, reqTime, response, request, key) => {
    const ts = new TunnelSession(key);
    //apply data
    ts.i = RegisterTunnelSession(ts);
    ts.type = type;
    ts.description = description;
    ts.res = response;
    if(request.socket)
        ts.ip = request.socket.remoteAddress;
    //open HTTP stream
    response.writeHead(200, HTTPstreamHead);
    //send info
    const info = {
        controlMessageInterval: config.profile.controlMessageInterval
        ,maxIdleTime: config.profile.maxIdleTime
        ,key: ts.key
        ,address: (config.useSSL ? 'wss://' : 'ws://') + config.hostname + ':' + config.port + '/' + ts.key
        ,requestTime: reqTime
        ,time: new Date().getTime()
    };
    response.write(JSON.stringify(info));
};

//checks tunnels inactivity
const CheckTunnels = () => {
    tunnels.forEach(e => {
        if(e)
            e.LifeCheck();
    });
};
setInterval(CheckTunnels, config.profile.checkIdleInterval);

//sends controll messages
const SendControlMessages = () => {
    tunnels.forEach(e => {
        if(e)
            e.ControlMessage();
    });
};
setInterval(SendControlMessages, config.profile.controlMessageInterval);

//#endregion

//================================================================
//#region PhusionPassenger

if (typeof(PhusionPassenger) != 'undefined') {
    PhusionPassenger.configure({ autoInstall: false });
}

//#endregion

//================================================================
//#region Server

const HTTPdefaultHead = {
    //CORS
    'Access-Control-Allow-Origin': '*'
    ,'Access-Control-Allow-Methods': 'GET'//, POST, PUT, DELETE'
    ,'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    //Rest...
    ,'Content-Type': 'text/plain'
};

const HTTPstreamHead = {
    'Content-Type': 'text/event-stream' // Use the appropriate content type
    ,'Cache-Control': 'no-cache'
    ,'Connection': 'keep-alive'
    ,'X-Accel-Buffering': 'no'
};

const QuickAPIResponse = (response, message) => {
    response.writeHead(200, HTTPdefaultHead);
    response.end(message);
};

const server = http.createServer((req, res) => {
    //correct url
    let url = req.url;
    const input = parseJSONfromURL(url);
    if(url.lastIndexOf('/') + 1 != url.length)
        url += '/';

    //================================================================
    //#region /list

    if(input && isLeftEqual(url, '/list/')){
        //check password
        if(input.password != config.manager.password){
            QuickAPIResponse(res, 'Wrong password!!!');
            return;
        }
        //create list
        const json = [];
        let current = null;
        let e = null;
        for(let i = 0; i < tunnels.length; i++){
            e = tunnels[i];
            if(e)
                current = {
                    key: e.key
                    ,ip: e.ip
                    ,type: e.type
                    ,description: e.description
                    ,lastMessage: e.lastMessage
                };
            else
                current = null;
            json.push(current)
        }
        QuickAPIResponse(res, JSON.stringify(json));
    }

    //#endregion

    //================================================================
    //#region /tunnel

    else if(input && isLeftEqual(url, '/tunnel/')){
        const reqTime = new Date().getTime() - input.time;
        //try to check key
        if(typeof(input.key) == 'string'){
            //there is a chance to create multiple tunnels with the same key!!! (but let it be a feature)
            //check in array
            let i = 0;
            for(i = config.profile.keys.length - 1; i >= 0; i--){
                if(config.profile.keys[i] == input.key)
                    break;
            }
            //check if not found
            if(i < 0){
                QuickAPIResponse(res, 'Wrong key!!!');
                return;
            }
            //let the key remain
        }
        else{
            //forget the key
            input.key = undefined;

            //check password type
            if(typeof(input.password) != 'string'){
                QuickAPIResponse(res, 'Wrong password type!!!');
                return;
            }

            //check password
            if(input.password != config.profile.password){
                QuickAPIResponse(res, 'Wrong password!!!');
                return;
            }
        }
        //Create tunnel session
        CreateNewTunnelSession(input.type, input.description, reqTime, res, req, input.key);
    }

    //#endregion
    
    //================================================================
    //#region /refresh

    else if(input && isLeftEqual(url, '/refresh/')){
        const reqTime = new Date().getTime() - input.time;
        //check basics 
        if(typeof(input.key) != 'string'){
            QuickAPIResponse(res, 'Wrong key!!!');
            return;
        }
        //find
        const session = FindTunnelSession(input.key);
        if(!session){
            QuickAPIResponse(res, 'Wrong key!!!');
            return;
        }
        //change response
        session.Refresh(res, reqTime);
    }

    //#endregion

    //================================================================
    //#region default

    else
        QuickAPIResponse(res, 'Not found');
    
    //#endregion
});

//#endregion

//================================================================
//#region WebSocket Server

const wss = new WebSocket.Server({ server });

// Set up a connection event listener
wss.on('connection', (ws, req) => {
    //get key
    let key = req.url;
    if(key.lastIndexOf('/') + 1 == key.length)
        key = key.substring(0, key.length - 1);
    key = key.substring(key.lastIndexOf('/') + 1);
    //basic key check
    if(typeof(key) != 'string'){
        ws.terminate();
        return;
    }
    //find session
    const session = FindTunnelSession(key);
    if(!session){
        ws.terminate();
        return;
    }
    //check who is calling
    if(session.client)
        if(session.server)
            //All is connected, and there is no place for a another socket 
            ws.terminate();
        else{
            //This must be server
            session.server = ws;
            ws._session = session;
            SetupServerWS(ws);
        }
    else{
        //update lastMessage and later await for the server to connect 
        session.lastMessage = new Date();
        //This must be a client
        session.client = ws;
        ws._session = session;
        SetupClientWS(ws);
        //inform the server
        if(session.res){
            session.res.end('"OK"');
            session.res = null;
        }
        else{
            console.log('WEIRD FUCKING ERROR');
        }
    }
});

const SetupClientWS = (ws) => {
    //message
    ws.on('message', (message) => {
        //update last message but only if the server is connected
        if(ws._session.server){
            //update date
            ws._session.lastMessage = new Date();
            //send message
            ws._session.server.send(message);
        }
        else
            ;//console.log("Blocked:", message.toString());
    });

    //close
    ws.on('close', () => {
        ws._session.Kill();
    });
};

const SetupServerWS = (ws) => {
    //message
    ws.on('message', (message) => {
        //update last message
        ws._session.lastMessage = new Date();
        //send message
        ws._session.client.send(message);
    });

    //close
    ws.on('close', () => {
        ws._session.Kill();
    });
};

//#endregion

//================================================================
//#region Run

//consider PhusionPassenger existance
if (typeof(PhusionPassenger) != 'undefined') {
    server.listen('passenger', () => {
        console.log('HTTP server running on passenger');
    });
}else{
    server.listen(config.port, () => {
        console.log(`Server is running on port ${config.port}`);
    });
}

//#endregion