let query = null
let button = null
let downloadStop = null
let downloadStart = null

onElementAvailable('.it-brand-wrapper', initialize)

function onElementAvailable(selector, callback) {
    if (document.querySelector(selector)) {
        callback()
    } else {
        const observer = new MutationObserver(mutations => {
            if (document.querySelector(selector)) {
                observer.disconnect()
                callback()
            }
        })
        observer.observe(document.body, { childList: true, subtree: true })
    }
}

function initialize(event) {
    const divSource = `
      <div id="bdp-downloader">
                <label for="download-start" style="color: white">Start: </label>
                <input type="number" style="width: auto" id="download-start" name="download-start" min="1" max = "99999" size="5" data-focus-mouse="false">
                &nbsp;
                <label for="download-stop" style="color: white">Stop: </label>
                <input type="number" style="width: auto" id="download-stop" name="download-start" min="1" max = "99999" size="5" data-focus-mouse="false">
                &nbsp;
                <button id="download-button" class="btn btn-secondary ms-3 flex-fill" style="width: 200px; height: 50px">Download All</button>
            </div>
    `
    const div = document.getElementById('bdp-downloader')
    if (!div) {
        const logo = document.getElementsByClassName('it-brand-wrapper')[0]
        logo.insertAdjacentHTML('afterend', divSource)
    } else {
        div.outerHTML = divSource
    }
    button = document.getElementById('download-button')
    downloadStop = document.getElementById('download-stop')
    downloadStart = document.getElementById('download-start')

    button.addEventListener('click', downloadListener)
    browser.runtime.onMessage.addListener(messageListener)
    browser.runtime.sendMessage({ command: 'start' })
}

function messageListener(message, sender, sendResponse) {
    console.log(message)
    switch (message.command) {
        case 'storeQuery':
            query = message.query
            if (query) {
                downloadStop.value = message.total
                downloadStart.value = 1
            }
            break
        case 'startDownload':
            button.style.backgroundColor = 'red'
            break
        case 'progressDownload':
            button.innerHTML = 'Downloading ' + message.current + ' of ' + message.total
            break
        case 'stopDownload':
            button.style.removeProperty('background-color')
            button.innerHTML = 'Download All'
            window.alert('Download completed: ' + message.current + ' of ' + message.total +
                ' - newly downloaded: ' + message.downloaded)
            break
        default:
            console.error('Unknown command: ' + message.command)
    }
}

function downloadListener() {
    if (!query) {
        alert('You need to search for something first')
    } else {
        browser.runtime.sendMessage({ command: 'download', start: parseInt(downloadStart.value), stop: parseInt(downloadStop.value) })
    }
}
