//================================================================
//#region Requirements

const net = require('net');
const dgram = require('dgram');
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
    socket.end();
};

//#endregion

//================================================================
//#region SOCK5 Server

const HandleSocketConnetion = clientSocket => {
    // Initial handshake
    clientSocket.onData = data => {
        // Reply with no authentication required
        clientSocket.write(Buffer.from([0x05, 0x00]));

        // Request details
        clientSocket.onData = request => {
            const version = request[0];
            const command = request[1];
            const addressType = request[3];

            if (command === 0x01) { // TCP CONNECT
                let address;
                if (addressType === 1) { // IPv4
                    address = request.slice(4, 8).join('.');
                } else if (addressType === 3) { // Domain name
                    const domainLength = request[4];
                    address = request.slice(5, 5 + domainLength).toString('utf-8');
                    //console.log(address);
                } else {
                    clientSocket.end();
                    return;
                }

                const port = request.readUInt16BE(request.length - 2);

                // Connecting to the target
                const remoteSocket = new net.Socket();
                remoteSocket.connect(port, address, () => {
                    // Send success response
                    const response = Buffer.alloc(10);
                    response[0] = 0x05; // SOCKS version
                    response[1] = 0x00; // Success
                    response[2] = 0x00; // Reserved
                    response[3] = 0x01; // IPv4 address type
                    response.writeUInt32BE(0, 4); // Bind address (0.0.0.0)
                    response.writeUInt16BE(0, 8); // Bind port (0)
                    clientSocket.write(response);

                    // Relay data between client and target using write
                    clientSocket.onData = data => {
                        remoteSocket.write(data);
                    };

                    remoteSocket.on('data', (data) => {
                        clientSocket.write(data);
                    });
                });

                remoteSocket.on('error', (err) => {
                    console.error(`Connection error: ${err}`);
                    clientSocket.end();
                });

                clientSocket.onClose = () => {
                    remoteSocket.end();
                };

                remoteSocket.on('close', () => {
                    clientSocket.end();
                });
            } else if (command === 0x03) { // UDP ASSOCIATE
                // Create a UDP socket for the client
                const udpSocket = dgram.createSocket('udp4');

                udpSocket.on('message', (message, rinfo) => {
                    // Forward UDP packets to the client
                    const header = Buffer.alloc(10);
                    header[0] = 0x00; // Reserved
                    header[1] = 0x00; // Reserved
                    header[2] = 0x00; // Fragment number
                    header[3] = 0x01; // IPv4 address type
                    header.writeUInt32BE(rinfo.address, 4); // Target address
                    header.writeUInt16BE(rinfo.port, 8); // Target port

                    const packet = Buffer.concat([header, message]);
                    clientSocket.write(packet);
                });

                udpSocket.on('error', (err) => {
                    console.error(`UDP error: ${err}`);
                    clientSocket.end();
                });

                udpSocket.bind(() => {
                    const address = udpSocket.address();
                    const response = Buffer.alloc(10);
                    response[0] = 0x05; // SOCKS version
                    response[1] = 0x00; // Success
                    response[2] = 0x00; // Reserved
                    response[3] = 0x01; // IPv4 address type
                    response.writeUInt32BE(0, 4); // Bind address (0.0.0.0)
                    response.writeUInt16BE(address.port, 8); // Bind port
                    clientSocket.write(response);
                });

                clientSocket.onData = data => {
                    // Forward UDP packets from the client to the target
                    const targetAddress = data.slice(4, 8).join('.');
                    const targetPort = data.readUInt16BE(8);
                    const payload = data.slice(10);

                    udpSocket.send(payload, targetPort, targetAddress, (err) => {
                        if (err) {
                            console.error(`UDP send error: ${err}`);
                        }
                    });
                };

                clientSocket.onClose = () => {
                    udpSocket.close();
                };
            } else {
                clientSocket.end();
            }
        };
    };
    
    //clientSocket.onError = err => {
    //    console.error(`Client error: ${err}`);
    //};
};

const SocketConnection = class {
    constructor(key){
        //info
        this.key = key;
        //chain
        this.chainFront = null;
        //events
        this.onData = () => {};
        this.onClose = () => {};
        //additional
        HandleSocketConnetion(this);
    }

    write(data){
        const b = Buffer.alloc(data.length + 2);
        data.copy(b);
        b.writeInt16LE(this.key, b.length - 2);
        Send(b);
    }

    end(){
        //console.log("END!!!!!!!");
        if(this.key >= 0)
            KillSocket(this);
    }
};

//#endregion

//================================================================
//#region Functions

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
            socket.end();
        }
    }
    else{
        //forward message to the client
        socket = FindSocket(key);
        if(!socket){
            //create new socket
            socket = new SocketConnection(key);
            //assign to chain
            RegisterSocket(socket);
        }
        //forward the message (without the key)
        message = message.slice(0, message.length - 2);
        socket.onData(message);
    }
};

const onEnd = () => {
    //Kill every socket in the chain without a message
    while(socketChainHead){
        socketChainHead.key = -1;
        socketChainHead.end();
        socketChainHead = socketChainHead.chainFront;
    }
};

module.exports = {applicationType, Init, onStart, onMessage, onEnd};

//#endregion