//================================================================
//#region Useful Functions

const FetchAPI = (path, json) => new Promise(resolve => {
    //construct url
    let url = (config.useSSL ? 'https://' : 'http://') + config.address + path;
    if(json){
        //correct url
        if(url.lastIndexOf('/') + 1 != url.length)
            url += '/';
        //push additional parameters
        json = JSON.parse(JSON.stringify(json));
        json.password = config.password;
        //add to url
        url += encodeURIComponent(JSON.stringify(json))
    }
    
    //fetch
    console.log(url);
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.text(); // Parse the response as JSON
        })
        .then(data => {
            // The parsed JSON data is available here
            resolve(data);
        })
        .catch(error => {
            console.error('There was a problem with the fetch operation:', error);
            resolve(null);
        });
});

const ParseJSON = (data) => {
    try{
        return JSON.parse(data);
    }
    catch(e){
        return null;
    }
};

const GetTunnelWSAddress = key => (config.useSSL ? 'wss://' : 'ws://') + config.address + '/' + key;

//#endregion

//================================================================
//#region List

const tunnels = document.getElementById('tunnels');
const HTML_tunnels = tunnels.innerHTML;
const RefreshTunnelsList = async () => {
    tunnels.innerHTML = "<tr><td>Fetching...</td></tr>";
    const list = ParseJSON(await FetchAPI('/list', {}));
    if(!list){
        tunnels.innerHTML = "<tr><td>There was an error with the list refresh</td></tr>";
        return;
    }
    tunnels.innerHTML = HTML_tunnels;
    let temp = '';
    let e = null;
    for(let i = 0; i < list.length; i++){
        e = list[i];
        temp = '<tr>';
        if(e){
            temp += '<td>' + i + '</td>';
            temp += '<td>' + e.key + '</td>';
            temp += '<td>' + e.ip + '</td>';
            temp += '<td><a href="';
            //construct url page
            const json = {
                title: i + ' - ' + e.ip
                ,address: GetTunnelWSAddress(e.key)
                ,description: e.description
            };
            temp += e.type + '/index.html#' + encodeURIComponent(JSON.stringify(json));
            //continue rest
            temp += '">' + e.type + '</a></td>';
            temp += '<td>' + e.description + '</td>';
            temp += '<td>' + e.lastMessage + '</td>';
        }
        else{
            temp += '<th colspan="6">NULL</th>';
        }
        temp += '</tr>';
        tunnels.innerHTML += temp;
    }
};
RefreshTunnelsList();

//#endregion