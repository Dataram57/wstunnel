//================================================================
//#region CheckConfig

if(typeof(config) === 'undefined'){
    config = {profiles:[]};
}

//#endregion

//================================================================
//#region Const functions

const ReadURLHashTagJSON = () => {
    const url = window.location.href;
    try{
        return JSON.parse(decodeURIComponent(url.substring(url.indexOf('#') + 1)));
    }
    catch{
        return null;
    }
};

const HexToUint8Array = (hexString) => {
    // Check if the hex string has an even number of characters
    if (hexString.length % 2 !== 0) {
        throw new Error("Hex string must have an even number of characters.");
    }

    // Create an array to store the parsed values
    const uint8Array = new Uint8Array(hexString.length / 2);

    // Parse the hex string and populate the Uint8Array
    for (let i = 0; i < hexString.length; i += 2) {
        const byte = parseInt(hexString.substr(i, 2), 16);
        uint8Array[i / 2] = byte;
    }

    return uint8Array;
};

const RandomBytes = (length) => {
    const array = new Uint8Array(length);
    let i = length;
    while(i-- > 0)
        array[i] = Math.floor(Math.random() * 256);
    return array;
};

const ConcatUint8Arrays = (arr1, arr2) => {
    const newArr = new Uint8Array(arr1.length + arr2.length);
    newArr.set(arr1, 0); // Copy arr1 to the beginning of newArr
    newArr.set(arr2, arr1.length); // Copy arr2 after arr1 in newArr
    return newArr;
};

const Uint8ArrayToHex = (array) => {
    let temp = '';
    for(let i = 0; i < array.length; i++)
        temp += array[i].toString(16);
    return temp;
};

//#endregion

//================================================================
//#region Encryption & Decryption

let superSecretKey = new Uint8Array(0);
let secretSeed = new Uint8Array(0); //will be null when transfered

const Hash_SHA256 = async obj => {
    // Convert the string to an array buffer
    let data;
    switch(typeof(obj)){
        case 'string':
            const encoder = new TextEncoder();
            data = encoder.encode(obj);
            break;
        default:
            data = obj;
            break;
    }

    // Calculate the SHA-256 hash
    return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
};

//Object that predicts the next key, and allows to encrypt and decrypt a message with it
//Made to protect SSH messages
//1. Server sends his seed (waits for client to respond)
//2. Client sends his seed (waits for server to respond)
//3. Server launches the application
const CryptoProfile = class {
    constructor(){
        this.key = new Uint8Array(32);
        //AES only
        this.iv = new Uint8Array(16);
        //Browser only
        this.cryptoKey = null;
    }

    async SetToBase(){
        this.key = new Uint8Array(0);
        await this.NextKey();
    }

    async SetSeed(seed){
        this.key = seed;
        await this.NextKey();
    }

    async NextKey(){
        //calculate the next key that the profile will use
        this.key = await Hash_SHA256(ConcatUint8Arrays(superSecretKey, this.key));
        //AES only
        this.iv = (await Hash_SHA256(this.key)).subarray(0, 16);
        //Browser only
        this.cryptoKey = await crypto.subtle.importKey(
            'raw',
            this.key,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async Encrypt(message){
        //convert message
        let data;
        switch(typeof(message)){
            case 'string':
                const encoder = new TextEncoder();
                data = encoder.encode(message);
                break;
            default:
                data = message;
                break;
        }

        // Encrypt the data
        return new Uint8Array(await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: this.iv,
            },
            this.cryptoKey,
            data
        ));
    }

    async Decrypt(message){
        return new Uint8Array(
            await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: this.iv,
                },
                this.cryptoKey,
                message
            )
        );
    }
};

const cryptoServer = new CryptoProfile();
const cryptoClient = new CryptoProfile();

//#endregion

//================================================================
//#region Const vars

const windowInfo = ReadURLHashTagJSON();
document.title = windowInfo.title;

//#endregion

//================================================================
//#region Terminal

let term = new Terminal();
term.open(document.getElementById('terminal'));

//onKeyInput
term.onKey(async e => {
    if(socket)
        Send(e.key);
});

//#endregion

//================================================================
//#region WebSocket

//write log
let socket = null;

const SetupWS = () => {
    socket = new WebSocket(windowInfo.address);
 
    socket.addEventListener("error", (event) => {
        socket.close();
        socket = null;
        console.log(event);
    });
    
    //open
    socket.addEventListener("open", (event) => {
    });
    
    //message
    socket.addEventListener("message", (event) => {
        processorServer.Process(event);
    });
    
    // Listen for messages
    socket.addEventListener("close", (event) => {
        socket = null;
        term.write("\n\rConnection closed.");
    });    
};

const Send = (message) => {
    processorClient.Process(message);
};

//#endregion

//================================================================
//#region Input line

let isProfileSelectBlock = false;
const tagInputLine = document.getElementById('input-line');
tagInputLine.addEventListener('keypress',e => {
    if (e.key !== "Enter")
        return;
    //get input
    const input = tagInputLine.value;
    tagInputLine.value = '';
    //recognize state
    if(socket){
        Send(input);
    }
    else if(!isProfileSelectBlock){
        const i = parseInt(input);
        if(isNaN(i) || i < 0 || i > config.profiles.length)
            return term.writeln('Wrong index!');
        //index is correct so get the key and start connecting
        term.writeln('Selected ' + i + '. ' + config.profiles[i].name);
        Connect(config.profiles[i]);
    }
});

//#endregion

//================================================================
//#region Async processing

//Simple async data processor
const AsyncProcessor = class{
    constructor(func_process){
        if(func_process)
            this.func_process = func_process;
        else
            this.func_process = async () => {};
        this.data = [];
    }

    async Process(input){
        //add input
        this.data.push(input);
        //block rest of code if the processing loop is running
        if(this.data.length != 1)
            return;
        //run the loop
        while(this.data.length > 0){
            await this.func_process(this.data[0]);
            this.data = this.data.slice(1);
        }
    }
};

//Processing ingoing messages
const processorServer = new AsyncProcessor(async (event) => {
    //get the message from the event
    const message = await event.data.arrayBuffer();;
    let doNextKey = true;
    //decrypt
    try{
        //decrypt the message
        const result = await cryptoServer.Decrypt(message);
        //use other key
        await cryptoServer.NextKey();
        doNextKey = false;
        //check if seed
        if(secretSeed){
            //apply server seed
            await cryptoServer.SetSeed(result);
            //send your seed
            Send(secretSeed);
            //apply your seed
            await cryptoClient.SetSeed(secretSeed);
            //don't care about the seed;
            secretSeed = null;
        }
        else
            term.write(result);
    }
    catch(e){
        console.log(e);
        if(doNextKey)
            await cryptoServer.NextKey();
    }
});

//Processing outgoing messages
const processorClient = new AsyncProcessor(async (message) => {
    try{
        if(socket){
            socket.send(await cryptoClient.Encrypt(message));
            await cryptoClient.NextKey();
        }
    }
    catch(e){
        console.log(e);
    }
});

//#endregion

//================================================================
//#region Startup

//show all key slots
term.writeln("Here are your super secret keys profiles");
for(let i = 0; i < config.profiles.length; i++)
    term.writeln(i + ". " + config.profiles[i].name);
term.writeln("Select the one that the tunnel will be using.");

const Connect = async (profile) => {
    isProfileSelectBlock = true;
    //Encryption and Decryption
    term.write('Preparing keys...');
    //convert the superSecretKey to "bytes"
    superSecretKey = await HexToUint8Array(profile.superSecretKey);
    //generate the secret seed
    secretSeed = RandomBytes(Math.floor(Math.random() * (profile.seedMaxSize - profile.seedMinSize + 1)) + profile.seedMinSize);
    //Set to base
    cryptoServer.SetToBase();
    cryptoClient.SetToBase();

    //Finnaly start
    term.write("Connecting...");
    SetupWS();
};

//#endregion