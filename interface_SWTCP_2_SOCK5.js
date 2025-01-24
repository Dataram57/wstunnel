//================================================================
//#region Requirements

const net = require('net');
const CryptoProfile = require('./lib_crypto.js');
let config; //= require('./config_SWTCP.json');
if(process.moduleConfigPath)
    config = require(process.moduleConfigPath);
else
    config = require('./config_SWTCP_2.json');

//#endregion

//================================================================
//#region Encryption & Decryption

//prepare superSecretKey
config.superSecretKey = Buffer.from(config.superSecretKey, 'hex');

//prepare profiles
const cryptoServer = new CryptoProfile(config.superSecretKey);
const cryptoClient = new CryptoProfile(config.superSecretKey);

//Scheme:
//1. Server sends seed (client is waiting for this seed)
//2. Client uses this seed, and sends his (server is waiting for this seed (not required for client to wait for))
//3. Server and Client can now start a conversation

//#endregion

//================================================================
//#region Init

const applicationType = "SWTCP_2_SOCK5";
let OriginalSend = function(){};
let Close = function(){};
const Init = (func_message, func_close) => {
    OriginalSend = func_message;
    Close = func_close;
};

const Send = message => {
    //Encryption here
    message = cryptoServer.Encrypt(message);
    //next key
    cryptoServer.NextKey();
    //send
    OriginalSend(message);
};

//#endregion

//================================================================
//#region Socket Chain

let socketChainHead = null;

const RegisterSocket = (socket) => {
    socket.chainFront = socketChainHead;
    socketChainHead = socket;
};

const RemoveSocket = (socket) => {
    let last = null;
    let obj = socketChainHead;
    while(obj){
        if(obj == socket){
            if(last)
                last.chainFront = obj.chainFront;
            else
                socketChainHead = obj.chainFront;
            return;
        }
        //next
        last = obj;
        obj = obj.chainFront;
    }
};

const RemoveSocketByKey = (key) => {
    let last = null;
    let obj = socketChainHead;
    while(obj){
        if(obj.key == key){
            if(last)
                last.chainFront = obj.chainFront;
            else
                socketChainHead = obj.chainFront;
            return obj;
        }
        //next
        last = obj;
        obj = obj.chainFront;
    }
    return null;
};

const RemoveAllSockets = () => {
    socketChainHead = null;
};

const FindSocket = (key) => {
    let last = null;
    let obj = socketChainHead;
    while(obj){
        //check key
        if(obj.key == key){
            //move on the top of the chain
            if(last){
                last.chainFront = obj.chainFront;
                obj.chainFront = socketChainHead;
                socketChainHead = obj;
            }
            return obj;
        }
        //next
        last = obj;
        obj = obj.chainFront;
    }
    return null;
};

const KillSocket = (socket) => {
    //check key
    if(socket.key >= 0){
        //Send info about the closed socket
        const b = Buffer.alloc(2);
        b.writeInt16LE(-(socket.key + 1), 0);
        Send(b);
    }
    //remove socket from the chain
    RemoveSocket(socket);
    socket.key = -1;
    //close socket
    socket.destroy();
};

//#endregion

//================================================================
//#region Functions

const SetupSocketEvents = (socket) => {
    //setup message receivment
    switch(socket.type){
        case "tcp":{
            socket.on('data', (data) => {
                //forward encrypted message
                const b = Buffer.alloc(data.length + 2);
                data.copy(b);
                //id
                b.writeInt16LE(socket.key, b.length - 2);
                Send(b);
            });
        };break;
        case "udp":{
            socket.on('message', (message, rinfo) => {
                //forward encrypted message
                const b = Buffer.alloc(10 + message.length + 2);
                b[0] = 0x00; // Reserved
                b[1] = 0x00; // Reserved
                b[2] = 0x00; // Fragment number
                b[3] = 0x01; // IPv4 address type
                b.writeUInt32BE(rinfo.address, 4); // Target address
                b.writeUInt16BE(rinfo.port, 8); // Target port
                message.copy(b, 10);
                //id
                b.writeInt16LE(socket.key, b.length - 2);
                Send(b);
            });
        };break;
    }

    // Handle connection close
    socket.on('close', () => {
        //Close socket procedure    
        KillSocket(socket);
    });

    // Handle connection close
    socket.on('error', e => {
        //Close socket procedure
        KillSocket(socket);
    });
};

const onStart = () => {
    //Reset the socket array
    RemoveAllSockets();
    
    //reset crypto profiles
    cryptoServer.SetToBase();
    cryptoClient.SetToBase();
    //send server seed
    const seed = cryptoServer.GenerateRandomSeed(config.seedMinSize, config.seedMaxSize);
    Send(seed);     //encrypted with the base
    cryptoServer.SetSeed(seed);
};

const onMessage = (message) => {
    //vars
    let key = 0;
    let socket = null;
    
    //decrypt message
    message = cryptoClient.Decrypt(message);
    //check seed
    if(!cryptoClient.isSeedApplied){
        cryptoClient.SetSeed(message);
        return; //skip forwarding the message
    }
    //calc next key
    cryptoClient.NextKey();
    
    //forward message to client
    //check key
    key = message.readInt16LE(message.length - 2);
    if(key < 0){
        //convert key
        key = -(key + 1);
        //Kill without a message
        if(socket = RemoveSocketByKey(key)){
            socket.key = -1;
            socket.destroy();
        }
    }
    else{
        //forward message to the client
        socket = FindSocket(key);
        if(!socket){
            //create new socket
            socket = new net.Socket();
            socket.key = key;
            socket.connect(config.port, config.host, () => {
                SetupSocketEvents(socket);
            });
            //assign to chain
            RegisterSocket(socket);
        }
        //forward the message (without the key)
        message = message.slice(0, message.length - 2);
        socket.write(message);
    }
};

const onEnd = () => {
    //Kill every socket in the chain without a message
    while(socketChainHead){
        socketChainHead.key = -1;
        socketChainHead.destroy();
        socketChainHead = socketChainHead.chainFront;
    }
};

module.exports = {applicationType, Init, onStart, onMessage, onEnd};

//#endregion