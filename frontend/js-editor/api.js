backendApiBase = "http://localhost:7007";
frontendVersion = "development";

function sendRequest(url , _type, auth) {
    var xhr = new XMLHttpRequest();
    xhr.open(_type, url, false);
    addAuth(xhr, auth)
    try {
        xhr.send();
        return xhr
    } catch (err) {
        return null
    }
}

function doGetJsonSync(url, auth) {
    var xhr = sendRequest(url, "GET", auth)
    if (xhr && xhr.status == 200) {
        return JSON.parse(xhr.response)
    }
    return null
}

function doDeleteSync(url, auth) {
    var xhr = sendRequest(url, "DELETE", auth)
    return (xhr && xhr.status == 200)
}

function doDeleteWithJsonRespSync(url, auth) {
    var xhr = sendRequest(url, "DELETE", auth)
    if (xhr && xhr.status == 200) {
        return JSON.parse(xhr.response)
    }
    return null
}

function doPostJsonSync(url, value, auth) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, false);
    xhr.setRequestHeader("Content-Type", "application/json");
    addAuth(xhr, auth)
    var data = JSON.stringify(value);
    xhr.send(data);
    if (xhr.status == 200) {
        return JSON.parse(xhr.response)
    }
    return null
}

function addAuth(xhr, auth) {
    if (!auth) {
        return
    }
    sourceAndToken = getSourceAndToken()
    if (!sourceAndToken) {
        return
    }
    xhr.setRequestHeader("Authorization", authHeaderVal(sourceAndToken));
}

function getBackendVersion() {
    return doGetJsonSync(backendApiBase + "/version")
}