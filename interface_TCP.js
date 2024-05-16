//================================================================
//#region Requirements

const net = require('net');
const config = require('./config_TCP.json');

//#endregion

//================================================================
//#region Init

const applicationType = "TCP"
let Send = function(){};
let Close = function(){};
const Init = (func_message, func_close) => {
    Send = func_message;
    Close = func_close;
};

//#endregion

//================================================================
//#region Functions

let isClientWorking = false;
let client;

const KillClient = () => {
    isClientWorking = false;
    if(client)
        client.destroy();
    client = null;
};

const onStart = () => {
    //setup client
    isClientWorking = false;
    client = new net.Socket();

    //setup events
    client.connect(config.port, config.host, () => {
        //client ready
        isClientWorking = true;
        Send("I am ready!!!");

        //setup message receivment
        client.on('data', (data) => {
            //forward message
            Send(data);
        });
    
        // Handle connection close
        client.on('close', () => {
            //close
            KillClient();
        });
    });
};

const onMessage = (message) => {
    //forward message to client
    if(isClientWorking){
        client.write(message);
    }
};

const onEnd = () => {
    KillClient();
};

module.exports = {applicationType, Init, onStart, onMessage, onEnd};

//#endregion