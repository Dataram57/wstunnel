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

const ProtectHTMLtext = (text) => {
    return text;
};

const WriteLog = (who, message, color) => {
    let temp = '<tr><th';
    if(color)
        temp += ' style="color:' + color+ ';"';
    temp += '>' + ProtectHTMLtext(who) + ':</th><td>' + ProtectHTMLtext(message) + '</td></tr>';
    tagMessages.innerHTML += temp;
};

const SendMessage = () => {
    WriteLog('You', tagInputMessage.value);
    if(socket)
        socket.send(tagInputMessage.value);
    tagInputMessage.value = '';
};

//#endregion

//================================================================
//#region Const vars

const windowInfo = ReadURLHashTagJSON();
document.title = windowInfo.title;
const tagInputMessage = document.getElementById('tagInputMessage');
const tagMessages = document.getElementById('tagMessages');
tagMessages.innerHTML = '';

//#endregion

//================================================================
//#region Page Events

tagInputMessage.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        SendMessage();
    }
});

//#endregion

//================================================================
//#region WebSocket

WriteLog('Info', "Connecting",'white');
let socket = new WebSocket(windowInfo.address);

socket.addEventListener("error", (event) => {
    socket = null;
    WriteLog('Error!!!!!!', "Couldn't connect to the tunnel.", 'red');
});

//open
socket.addEventListener("open", (event) => {
    WriteLog('Info', "Connected!!!", 'white');
});

//message
socket.addEventListener("message", async (event) => {
    //console.log("Message from server ", event.data);
    console.log(event);
    WriteLog("Server", await event.data.text());
});

// Listen for messages
socket.addEventListener("close", (event) => {
    WriteLog('Info', "Closed!!!", 'white');
});

//#endregion