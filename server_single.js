//================================================================
//#region requirements

console.clear();
const http = require('http');
const WebSocket = require('ws');
const config = require('./config_single.json');

//correct key
config.key = "/" + config.key;

//module
process.moduleConfigPath = config.moduleConfigPath;
const appModule = require(config.module);
process.moduleConfigPath = undefined;

//#endregion

//================================================================
//#region PhusionPassenger

if (typeof(PhusionPassenger) != 'undefined') {
    PhusionPassenger.configure({ autoInstall: false });
}

//#endregion

//================================================================
//#region Server

const server = http.createServer((req, res) => {
    res.end("Hello, Time is: " + (new Date()).getTime());
});

//#endregion

//================================================================
//#region WebSocket Server

const wss = new WebSocket.Server({ server });
let socket = null;

wss.on('connection', (ws, req) => {
    //block unwanted
    if(socket){
        ws.terminate();
        return;
    }
    if(req.url != config.key){
        ws.terminate();
        return;
    }
    
    //message event
    ws.on('message', (message) => {
        appModule.onMessage(message);
    });

    //close event
    ws.on('close', () => {
        socket = null;
        appModule.onEnd();
    });

    //start
    socket = ws;
    appModule.onStart();
});

//#endregion

//================================================================
//#region App Module functions

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
