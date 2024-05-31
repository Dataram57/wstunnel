//================================================================
//#region Requirements

console.clear();
console.log('================================================================');
//check config path
let config;
if(process.argv.length > 2)
    config = require(process.argv[process.argv.length - 1]);
else
    config = require('./config.json');
//rest
const net = require('net');
const WebSocket = require('ws');
const CryptoProfile = require('./lib_crypto.js');

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
//#region Data Transmitter

//this section is for keeping the data that will be sent after the first message from the server (containing the seed).

const waitingDataToTransfer = [];

const BumpWaitingData = () => {
    //bump data
    for(let i = 0; i < waitingDataToTransfer.length; i++)
        Send(waitingDataToTransfer[i]);
    //clear data
    waitingDataToTransfer.length = 0;
};

const Send = (data) => {
    if(isTunnelWorking){
        //encrypt and send and next key
        ws.send(cryptoClient.Encrypt(data));
        cryptoClient.NextKey();
    }
    else
        waitingDataToTransfer.push(data);
};

//#endregion

//================================================================
//#region Socket Chain

let socketChainHead;

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
            if(last)
                last.chainFront = obj.chainFront;
            obj.chainFront = socketChainHead;
            socketChainHead = obj;
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

let socketLastKey = 0;

const NextSocketKey = () => {
    socketLastKey++;
    if(socketLastKey == 32767)
        socketLastKey = 0;
    return socketLastKey;
};

//#endregion

//================================================================
//#region Tunnel Manager

const TunnelCheck = () => {
    //try to close the tunnel if there is not any socket that demands a connection
    if(!socketChainHead){
        //close ws
        if(ws){
            ws.close();
            ws = null;
        }
        //
    }
};

//#endregion

//================================================================
//#region WS relay connector

let isTunnelWorking = false;
let ws;

const SendSeed = () => {
    const seed = cryptoClient.GenerateRandomSeed(config.seedMinSize, config.seedMaxSize);
    Send(seed);
    cryptoClient.SetSeed(seed);
};

const ConnectTunnel = () => {
    //reset crypto profiles
    cryptoServer.SetToBase();
    cryptoClient.SetToBase();
    //send seed (waiting to be sent)
    SendSeed();

    //Connect to the tunnel
    ws = new WebSocket(config.wsaddress);
    
    //setup events
    ws.on('open', () => {
        //log
        //console.log('Tunnel Locked.');
    });
    
    // Event listener for incoming messages from the server
    ws.on('message', (data) => {
        //vars
        let key = 0;
        let socket = null;

        //decrypt message
        data = cryptoServer.Decrypt(data);
        //check seed
        if(cryptoServer.isSeedApplied){
            //calculate next key
            cryptoServer.NextKey();

            //forward the message
            key = data.readInt16LE(data.length - 2);
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
                //find socket
                if(socket = FindSocket(key)){
                    //forward the message (without the key)
                    data.length -= 2;
                    socket.write(data);
                }
            }
        }
        else{
            //apply seed
            cryptoServer.SetSeed(data);

            //bump waiting data
            BumpWaitingData();
        }
    });
    
    // Event listener for WebSocket connection closure
    ws.on('close', () => {
        //close tcp
        CloseTunnel();
    });

    // Event listener for WebSocket connection errors
    ws.on('error', (error) => {
        //destroy tcp and ws
        console.log('WebSocket error:', error);
        CloseTunnel();
    });
};

const CloseTunnel = () => {
    //mark tunnel as closed(ready for a next connection)
    isTunnelWorking = false;
    //close ws
    if(ws){
        ws.close();
        ws = null;
    }
    //close tcp socket
    if(tcp){
        tcp.destroy();
        tcp = null;
    }

    //log
    //console.log('Tunnel Unlocked.');
};

//#endregion


//================================================================
//#region TCP local server

let tcp;

const server = net.createServer(socket => {
    //register this socket
    socket.key = NextSocketKey();
    RegisterSocket(socket);

    // Event listener for incoming data from clients
    socket.on('data', data => {
        //forward message with the socket index to the tunnel
        data.length += 2;
        data.writeInt16LE(socket.key, data.length - 2);
        Send(data);
    });

    // Event listener for client disconnection
    socket.on('end', () => {
        //kill this socket
        KillSocket(socket);
    });

    // Event listener for errors
    socket.on('error', e => {
        console.log(e);
        //kill this socket
        KillSocket(socket);
    });
});

// Start the server and listen on a specific port
server.listen(config.port, config.host, () => {
    console.log(`SWTCP_2 tunnel client started on ${config.host}:${config.port}`);
});

//#endregion