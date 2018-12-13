$.ajaxSetup({ cache: false });

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

var inputAccepted = false;

function acceptInput() {
    inputAccepted = true;
    $("#enter-button").prop("disabled", false)
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

async function validateProcess(processId) {
    var response = await apiPost("/ValidateProcess",
        {
            processId: processId
        }
    );
    console.log(`ProcessId is valid: ${response.valid}`)
    return response.valid;
}

async function pollOutput(processId) {
    var inProgress = true;
    var waitTime = 250
    while (inProgress) {
        console.log(`Waiting for ${waitTime}`)
        await timeout(waitTime);
        waitTime += 500;
        console.log("Polling for output")
        results = await apiPost("/OutputPoll",
            { processId: processId }
        );
        if (results.text) {
            updateLog(results.text);
            inProgress = false;
        }
    }
    return;
}

async function createProcess() {
    var response = await apiPost("/NewProcess");
    localStorage.setItem("processId", response.processId);
    await pollOutput(response.processId);
}

async function handleInput(inputText, processId) {
    updateLog(">" + inputText)
    var result = await apiPost("/TextInput",
        {
            inputText: inputText,
            processId: processId
        },
    );
    if (result.inProgress) {
        pollOutput(processId);
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
        var processId = localStorage.getItem("processId")
        handleInput($("#input-box").val(), processId);
        $("#input-box").val("");
    }
    $("#input-box").focus();
}

async function connectToProcess() {
    var processId = localStorage.getItem("processId")
    if (processId === null) {
        console.log("No processId found, asking the server to start a new game.");
        await createProcess()
    } else {
        valid = await validateProcess(processId)
        if (!valid) {
            console.log("Expired process, creating new one.")
            await createProcess()
        }
    }
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
        processId = localStorage.getItem("processId")
        if (processId) {
            //If a dropdown option is clicked, sent it's text to the console
            handleInput(target.data("text"), processId);
        }
    }
});

$("#enter-button").click(clearAndSend);

$(document).keyup(function (event) {
    if (event.which === 13) {
        clearAndSend();
    }
})

connectToProcess();
