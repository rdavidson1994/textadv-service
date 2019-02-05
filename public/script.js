$.ajaxSetup({ cache: false });

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

var inputAccepted = false;

function acceptInput() {
    inputAccepted = true;
    $(".game-button").prop("disabled", false)
}

async function apiPost(url, data) {
    data = data || {};
    var response = await $.ajax({
        type: "POST",
        contentType: "application/json; charset=utf-8",
        url: url,
        data: JSON.stringify(data),
        dataType: "json"
    });
    console.log(`Got this response : ${JSON.stringify(response)}`)
    return response //JSON.parse(response)
}

async function apiCall(method, url, data) {
    data = data || {};
    var response = await $.ajax({
        type: method,
        contentType: "application/json; charset=utf-8",
        url: url,
        data: JSON.stringify(data),
        dataType: "json"
    });
    console.log(`Got this response : ${JSON.stringify(response)}`)
    return response //JSON.parse(response)
}

/*async function validateProcess(gameId) {
    var response = await apiPost("/ValidateProcess",
        {
            gameId: gameId
        }
    );
    console.log(`gameId is valid: ${response.valid}`)
    return response.valid;
}*/

async function pollOutput(outputLocation) {
    var inProgress = true;
    var waitTime = 250
    while (inProgress) {
        console.log(`Waiting for ${waitTime}`)
        await timeout(waitTime);
        waitTime += 500;
        console.log("Polling for output")
        results = await apiCall("GET", outputLocation);
        if (results.text) {
            updateLog(results.text);
            inProgress = false;
        }
    }
    return;
}

async function createGame() {
    var response = await apiCall("POST", "/Games");
    sessionStorage.setItem("gameId", response.gameId);
    await pollOutput(response.outputLocation);
}



async function handleInput(inputText, gameId) {
    updateLog(">" + inputText)
    var result = await apiCall("POST", `/Games/${gameId}/Inputs`,
        {
            inputText: inputText,
        },
    );
    if (result.outputLocation) {
        pollOutput(result.outputLocation);
    }
}


function updateLog(newText) {
    oldText = $("#output_text").html()
    $("#output_text").html(oldText + "<br />" + newText)
    maxScroll = $("#log_text").prop("scrollHeight");
    $("#log_text").scrollTop(maxScroll);
}

function clearAndSend() {
    if (inputAccepted) {
        var gameId = sessionStorage.getItem("gameId")
        handleInput($("#input-box").val(), gameId);
        $("#input-box").val("");
    }
    $("#input-box").focus();
}

function saveGame() {
    if (inputAccepted) {
        var gameId = sessionStorage.getItem("gameId")
        if (!gameId) {
            console.log("WARNING: No gameId in local storage but input accepted");
        } else {
            apiCall("POST", `/Saves`, { gameId: gameId })
        }
    }
}

async function connectToProcess() {
    var gameId = sessionStorage.getItem("gameId")
    if (gameId === null) {
        console.log("No gameId found, asking the server to start a new game.");
        await createGame()
    } else {
        console.log("Found gameId, using it")
    }/*else {
        valid = await validateProcess(gameId)
        if (!valid) {
            console.log("Expired process, creating new one.")
            await createGame()
        }
    }*/
    acceptInput();
}


$(document).on("click", function (event) {
    target = $(event.target);
    var dropdownToOpen = $(); //Empty set
    //By default, all dropdowns close on any click

    if (target.hasClass("dropdown-link")) {
        siblingMenu = target.siblings(".dropdown-menu")
        if (!siblingMenu.hasClass("show")) {
            //But if the link of a closed dropdown is clicked, open that one only
            dropdownToOpen = siblingMenu;
        }
    }

    $(".show").removeClass("show");
    dropdownToOpen.addClass("show");

    if (target.is(".dropdown-option")) {
        gameId = sessionStorage.getItem("gameId")
        if (gameId) {
            //If a dropdown option is clicked, send its text to the console
            handleInput(target.data("text"), gameId);
        }
    }
});

$("#enter-button").click(clearAndSend);
$("#save-button").click(saveGame);
$(document).keyup(function (event) {
    if (event.which === 13) {
        clearAndSend();
    }
})

connectToProcess();
