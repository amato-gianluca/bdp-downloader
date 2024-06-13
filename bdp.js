var button = document.createElement("Button")
button.innerHTML = "Auto-Download"
button.style = "width: 200px; height: 50px; bottom:0; right:0; position:fixed; background-color: red"
button.addEventListener("click", auto_download)
document.body.appendChild(button)

function auto_download() {
    if (button.style.backgroundColor == "red")
        button.style.backgroundColor = "green"
    else
        button.style.backgroundColor = "red"
    browser.runtime.sendMessage({ command: "downloadList" });
}
