const joinOverlay = document.getElementById("joinOverlay");
const joinForm = document.getElementById("joinForm");
const userNameInput = document.getElementById("userNameInput");
const messagesList = document.getElementById("messagesList");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const uploadForm = document.getElementById("uploadForm");
const imageFileInput = document.getElementById("imageFileInput");
const generalFileInput = document.getElementById("generalFileInput");
const emojiTriggerBtn = document.getElementById("emojiTriggerBtn");
const imageTriggerBtn = document.getElementById("imageTriggerBtn");
const fileTriggerBtn = document.getElementById("fileTriggerBtn");
const emojiPopover = document.getElementById("emojiPopover");
const imagePreviewCard = document.getElementById("imagePreviewCard");
const imagePreviewImg = document.getElementById("imagePreviewImg");
const imagePreviewName = document.getElementById("imagePreviewName");
const imagePreviewSize = document.getElementById("imagePreviewSize");
const imagePreviewCancelBtn = document.getElementById("imagePreviewCancelBtn");
const imagePreviewSendBtn = document.getElementById("imagePreviewSendBtn");

let currentUserName = "";
let isCurrentlyTyping = false;
let typingTimeout = null;
let activeTypers = [];
let pendingImageFile = null;
let uploadIdCounter = 0;
let activeXHRs = {};
let isSendingMessage = false;
const renderedEventIds = new Set();

// Setup SignalR connection
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .withAutomaticReconnect()
    .build();

// Event receivers
connection.on("ReceiveMessage", (messageId, userName, message, sentAt) => {
    if (hasRenderedEvent(messageId)) return;
    appendTextMessage(userName, message, sentAt);
});

connection.on("ReceiveSystemMessage", message => {
    appendSystemMessage(message);
});

connection.on("ReceiveOnlineUsers", users => {
    // Sync typing indicators (purge typers who left)
    const activeNames = users.map(u => u.userName);
    activeTypers = activeTypers.filter(t => activeNames.includes(t));
    renderTypingStatus();
    
    renderOnlineUsers(users);
});

connection.on("ReceiveImage", (uploadId, userName, fileName, fileUrl, uploadedAt) => {
    if (hasRenderedEvent(uploadId)) return;
    appendImageMessage(userName, fileName, fileUrl, uploadedAt);
});

connection.on("ReceiveFile", (uploadId, userName, fileName, fileUrl, uploadedAt) => {
    if (hasRenderedEvent(uploadId)) return;
    appendFileMessage(userName, fileName, fileUrl, uploadedAt);
});

connection.on("ReceiveTypingState", (userName, isTyping) => {
    if (isTyping) {
        if (!activeTypers.includes(userName)) {
            activeTypers.push(userName);
        }
    } else {
        activeTypers = activeTypers.filter(t => t !== userName);
    }
    renderTypingStatus();
});

// Connection state hooks
connection.onreconnecting(error => {
    setConnectionStatus("Reconnecting", false, "Reconnecting");
});

connection.onreconnected(async connectionId => {
    setConnectionStatus("Connected", true, "Connected");
    await connection.invoke("JoinChat", currentUserName);
});

connection.onclose(() => {
    setConnectionStatus("Disconnected", false, "Disconnected");
});

// Join chat form submission
joinForm.addEventListener("submit", async event => {
    event.preventDefault();

    currentUserName = userNameInput.value.trim();

    if (!currentUserName) {
        userNameInput.focus();
        return;
    }

    try {
        if (connection.state === signalR.HubConnectionState.Disconnected) {
            await connection.start();
        }

        await connection.invoke("JoinChat", currentUserName);
        setConnectionStatus("Connected", true, "Connected");
        joinOverlay.classList.add("d-none");
        messageInput.focus();
        checkEmptyState();
    } catch (error) {
        appendSystemMessage(`Connection failed: ${error.message}`);
    }
});

// Send text message handler
function submitTextMessage() {
    const message = messageInput.value.trim();
    if (!message || isSendingMessage) return;

    isSendingMessage = true;
    sendButton.disabled = true;
    connection.invoke("SendMessage", message)
        .then(() => {
            messageInput.value = "";
            // Reset local typing indicator immediately
            isCurrentlyTyping = false;
            connection.invoke("SendTypingState", false).catch(err => console.error(err));
            clearTimeout(typingTimeout);
        })
        .catch(error => {
            appendSystemMessage(`Send failed: ${error.message}`);
        })
        .finally(() => {
            isSendingMessage = false;
            if (connection.state === signalR.HubConnectionState.Connected && !pendingImageFile) {
                sendButton.disabled = false;
            }
        });
}

// Intercept Enter key
messageInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        
        if (pendingImageFile) {
            imagePreviewSendBtn.click();
        } else {
            submitTextMessage();
        }
    }
});

// Send Button click
sendButton.addEventListener("click", () => {
    if (pendingImageFile) {
        imagePreviewSendBtn.click();
    } else {
        submitTextMessage();
    }
});

// Typing indicator trigger on text input
messageInput.addEventListener("input", () => {
    if (!isCurrentlyTyping) {
        isCurrentlyTyping = true;
        connection.invoke("SendTypingState", true).catch(err => console.error(err));
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isCurrentlyTyping = false;
        connection.invoke("SendTypingState", false).catch(err => console.error(err));
    }, 2000);
});

// ===== Messenger-style Emoji Picker =====
const EMOJI_DATA = {
    smileys: {
        label: "Mặt cười & Cảm xúc",
        emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","🫤","😟","🙁","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾"]
    },
    people: {
        label: "Người & Cơ thể",
        emojis: ["👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄","🫦","👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷","💆","💇","🚶","🧍","🧎","🏃","💃","🕺","👯","🧖","🧗","🤸","🏌️","🏄","🚣","🏊","⛹️","🏋️","🚴","🚵","🤼","🤽","🤾","🤺","🤹"]
    },
    animals: {
        label: "Động vật & Thiên nhiên",
        emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🪸","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐈","🐈‍⬛","🪶","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔","🐾","🐉","🐲","🌵","🎄","🌲","🌳","🌴","🪵","🌱","🌿","☘️","🍀","🎍","🪴","🎋","🍃","🍂","🍁","🪺","🪹","🍄","🌾","💐","🌷","🌹","🥀","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","🌙","🌎","🌍","🌏","🪐","💫","⭐","🌟","✨","⚡","☄️","💥","🔥","🌪️","🌈","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌬️","💨","💧","💦","🫧","☔","☂️","🌊","🌫️"]
    },
    food: {
        label: "Thức ăn & Đồ uống",
        emojis: ["🍇","🍈","🍉","🍊","🍋","🍌","🍍","🥭","🍎","🍏","🍐","🍑","🍒","🍓","🫐","🥝","🍅","🫒","🥥","🥑","🍆","🥔","🥕","🌽","🌶️","🫑","🥒","🥬","🥦","🧄","🧅","🍄","🥜","🫘","🌰","🍞","🥐","🥖","🫓","🥨","🥯","🥞","🧇","🧀","🍖","🍗","🥩","🥓","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🫔","🥙","🧆","🥚","🍳","🥘","🍲","🫕","🥣","🥗","🍿","🧈","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤","🍥","🥮","🍡","🥟","🥠","🥡","🦀","🦞","🦐","🦑","🦪","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🫖","🍵","🍶","🍾","🍷","🍸","🍹","🍺","🍻","🥂","🥃","🫗","🥤","🧋","🧃","🧉","🧊","🥢","🍽️","🍴","🥄","🔪","🫙","🏺"]
    },
    activities: {
        label: "Hoạt động",
        emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️","🤼","🤸","🤺","⛹️","🤾","🏌️","🏇","🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎗️","🎪","🤹","🎭","🩰","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🪗","🎸","🪕","🎻","🎲","♟️","🎯","🎳","🎮","🕹️","🎰","🧩"]
    },
    travel: {
        label: "Du lịch & Địa điểm",
        emojis: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🦯","🦽","🦼","🛴","🚲","🛵","🏍️","🛺","🚨","🚔","🚍","🚘","🚖","🛞","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇","🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️","⛴️","🚢","⚓","🪝","⛽","🚧","🚦","🚥","🚏","🗺️","🗿","🗽","🗼","🏰","🏯","🏟️","🎡","🎢","🎠","⛲","⛱️","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🗻","🏕️","⛺","🛖","🏠","🏡","🏘️","🏚️","🏗️","🏭","🏢","🏬","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏩","💒","🏛️","⛪","🕌","🕍","🛕","🕋","⛩️","🛤️","🛣️","🗾","🎑","🏞️","🌅","🌄","🌠","🎇","🎆","🌇","🌆","🏙️","🌃","🌌","🌉","🌁"]
    },
    objects: {
        label: "Đồ vật",
        emojis: ["⌚","📱","📲","💻","⌨️","🖥️","🖨️","🖱️","🖲️","🕹️","🗜️","💽","💾","💿","📀","📼","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🪫","🔌","💡","🔦","🕯️","🪔","🧯","🛢️","💸","💵","💴","💶","💷","🪙","💰","💳","💎","⚖️","🪜","🧰","🪛","🔧","🔨","⚒️","🛠️","⛏️","🪚","🔩","⚙️","🪤","🧱","⛓️","🧲","🔫","💣","🧨","🪓","🔪","🗡️","⚔️","🛡️","🚬","⚰️","🪦","⚱️","🏺","🔮","📿","🧿","🪬","💈","⚗️","🔭","🔬","🕳️","🩹","🩺","🩻","🩼","💊","💉","🩸","🧬","🦠","🧫","🧪","🌡️","🧹","🪠","🧺","🧻","🚽","🪣","🧼","🫧","🪥","🧽","🧴","🛎️","🔑","🗝️","🚪","🪑","🛋️","🛏️","🛌","🧸","🪆","🖼️","🪞","🪟","🛍️","🛒","🎁","🎈","🎏","🎀","🪄","🪅","🎊","🎉","🎎","🏮","🎐","🧧","✉️","📩","📨","📧","💌","📥","📤","📦","🏷️","🪧","📪","📫","📬","📭","📮","📯","📜","📃","📄","📑","🧾","📊","📈","📉","🗒️","🗓️","📆","📅","🗑️","📇","🗃️","🗳️","🗄️","📋","📁","📂","🗂️","🗞️","📰","📓","📔","📒","📕","📗","📘","📙","📚","📖","🔖","🧷","🔗","📎","🖇️","📐","📏","🧮","📌","📍","✂️","🖊️","🖋️","✒️","🖌️","🖍️","📝","✏️","🔍","🔎","🔏","🔐","🔒","🔓"]
    },
    symbols: {
        label: "Biểu tượng",
        emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🚭","❗","❕","❓","❔","‼️","⁉️","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❇️","✳️","❎","🌐","💠","Ⓜ️","🌀","💤","🏧","🚾","♿","🅿️","🛗","🈳","🈂️","🛂","🛃","🛄","🛅","🚹","🚺","🚼","⚧️","🚻","🚮","🎦","📶","🈁","🔣","ℹ️","🔤","🔡","🔠","🆖","🆗","🆙","🆒","🆕","🆓","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔢","#️⃣","*️⃣","⏏️","▶️","⏸️","⏯️","⏹️","⏺️","⏭️","⏮️","⏩","⏪","⏫","⏬","◀️","🔼","🔽","➡️","⬅️","⬆️","⬇️","↗️","↘️","↙️","↖️","↕️","↔️","↪️","↩️","⤴️","⤵️","🔀","🔁","🔂","🔄","🔃","🎵","🎶","➕","➖","➗","✖️","🟰","♾️","💲","💱","™️","©️","®️","👁️‍🗨️","🔚","🔙","🔛","🔝","🔜","〰️","➰","➿","✔️","☑️","🔘","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","🔸","🔹","🔶","🔷","🔳","🔲","▪️","▫️","◾","◽","◼️","◻️","🟥","🟧","🟨","🟩","🟦","🟪","⬛","⬜","🟫","🔈","🔇","🔉","🔊","🔔","🔕","📣","📢","💬","💭","🗯️","♠️","♣️","♥️","♦️","🃏","🎴","🀄","🕐","🕑","🕒","🕓","🕔","🕕","🕖","🕗","🕘","🕙","🕚","🕛","🕜","🕝","🕞","🕟","🕠","🕡","🕢","🕣","🕤","🕥","🕦","🕧"]
    },
    flags: {
        label: "Cờ",
        emojis: ["🏳️","🏴","🏁","🚩","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇻🇳","🇺🇸","🇬🇧","🇫🇷","🇩🇪","🇯🇵","🇰🇷","🇨🇳","🇹🇭","🇮🇩","🇵🇭","🇲🇾","🇸🇬","🇱🇦","🇰🇭","🇲🇲","🇮🇳","🇧🇷","🇲🇽","🇨🇦","🇦🇺","🇷🇺","🇮🇹","🇪🇸","🇵🇹","🇳🇱","🇧🇪","🇨🇭","🇦🇹","🇸🇪","🇳🇴","🇩🇰","🇫🇮","🇮🇪","🇵🇱","🇬🇷","🇹🇷","🇪🇬","🇿🇦","🇳🇬","🇰🇪","🇦🇷","🇨🇱","🇨🇴","🇵🇪","🇻🇪","🇪🇨","🇺🇾","🇵🇾","🇧🇴","🇵🇦","🇨🇷","🇨🇺","🇩🇴","🇵🇷","🇭🇹","🇯🇲","🇹🇹","🇧🇸","🇧🇧","🇬🇾","🇸🇷","🇧🇿","🇬🇹","🇭🇳","🇸🇻","🇳🇮","🇦🇪","🇸🇦","🇶🇦","🇰🇼","🇧🇭","🇴🇲","🇯🇴","🇱🇧","🇮🇶","🇮🇷","🇮🇱","🇵🇸","🇳🇿","🇫🇯","🇵🇬","🇼🇸","🇹🇴","🇹🇻","🇳🇷","🇰🇮","🇲🇭","🇫🇲","🇵🇼","🇺🇳"]
    }
};

// Search keywords map for emoji search (Vietnamese + English)
const EMOJI_KEYWORDS = {
    "😀": "cuoi smile grin happy vui","😃": "cuoi smile happy","😄": "cuoi smile laugh","😁": "cuoi beam grin","😆": "cuoi laugh ha","😅": "cuoi sweat nervous","🤣": "cuoi rolling floor","😂": "cuoi joy tears khoc","🙂": "cuoi slight","🙃": "lat upside","😉": "nháy mắt wink","😊": "cuoi blush smile","😇": "thien than angel halo","🥰": "yeu love hearts","😍": "yeu love heart eyes","🤩": "star struck sao","😘": "hon kiss","😗": "hon kiss","😚": "hon kiss","😙": "hon kiss","😋": "yum delicious ngon","😛": "le luoi tongue","😜": "nháy mắt wink tongue","🤪": "dien crazy zany","😝": "le luoi tongue squint","🤗": "om hug","🤔": "suy nghi thinking hmm","🤐": "im lang zip mouth","🤨": "ngo nghi raised eyebrow","😐": "binh thuong neutral","😏": "cuoi smirk","😒": "chan unamused","🙄": "eye roll","😬": "grimace","😌": "binh tinh relieved","😔": "buon sad pensive","😪": "buon ngu sleepy","😴": "ngu sleeping zzz","😷": "mask khau trang","🤒": "om sick thermometer","🤕": "bi thuong injured bandage","🤢": "buon non nauseated","🤮": "non vomiting","🥵": "nong hot","🥶": "lanh cold freezing","🥴": "say drunk woozy","🤯": "no oc mind blown exploding","🥳": "tiec party celebration","😎": "cool sunglasses","🤓": "nerd glasses","😕": "confused bon roi","😟": "lo lang worried","😮": "ngac nhien surprised open mouth","😲": "ngac nhien astonished","😳": "xau ho flushed","🥺": "xin please pleading","😢": "khoc cry sad","😭": "khoc crying loud","😱": "so hai scream fear","😤": "tuc gian angry huff","😡": "gian angry red","😠": "gian angry","🤬": "chui cursing","😈": "quy devil smile","👿": "quy devil angry","💀": "dau lau skull dead","💩": "poop phan","🤡": "he clown","👻": "ma ghost boo","👽": "nguoi ngoai hanh tinh alien","👾": "quai vat alien monster","🤖": "robot","❤️": "tim do love red heart yeu","🔥": "lua fire hot","👍": "tot like thumb up","👎": "khong like thumb down","👏": "vo tay clap","🙏": "cam on pray thanks please","💪": "co bap muscle strong","✨": "sparkles lap lanh","💯": "tram diem hundred perfect","🎉": "tiec party popper celebration chuc mung","🎊": "confetti celebration"
};

// Recent emojis (persisted in localStorage)
const RECENT_STORAGE_KEY = "signalrchatlab_recent_emojis";
const MAX_RECENT = 24;

function getRecentEmojis() {
    try {
        const stored = localStorage.getItem(RECENT_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
}

function addRecentEmoji(emoji) {
    let recent = getRecentEmojis();
    recent = recent.filter(e => e !== emoji);
    recent.unshift(emoji);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent)); } catch {}
}

// Build and render the emoji grid
function renderEmojiGrid(filter = "") {
    const container = document.getElementById("emojiGridContainer");
    const noResults = document.getElementById("emojiNoResults");
    container.innerHTML = "";
    let totalRendered = 0;
    
    const filterLower = filter.toLowerCase().trim();

    // Recent section
    if (!filterLower) {
        const recent = getRecentEmojis();
        if (recent.length > 0) {
            const section = createEmojiSection("recent", "Gần đây", recent);
            container.appendChild(section);
            totalRendered += recent.length;
        }
    }

    // Category sections
    for (const [catKey, catData] of Object.entries(EMOJI_DATA)) {
        let emojis = catData.emojis;
        
        if (filterLower) {
            emojis = emojis.filter(e => {
                const kw = EMOJI_KEYWORDS[e] || "";
                return e.includes(filterLower) || kw.includes(filterLower);
            });
        }
        
        if (emojis.length === 0) continue;
        
        const section = createEmojiSection(catKey, catData.label, emojis);
        container.appendChild(section);
        totalRendered += emojis.length;
    }
    
    if (totalRendered === 0) {
        noResults.classList.remove("d-none");
        container.style.display = "none";
    } else {
        noResults.classList.add("d-none");
        container.style.display = "";
    }
}

function createEmojiSection(catKey, label, emojis) {
    const section = document.createElement("div");
    section.className = "emoji-section";
    section.dataset.category = catKey;
    
    const header = document.createElement("div");
    header.className = "emoji-section-header";
    header.textContent = label;
    section.appendChild(header);
    
    const grid = document.createElement("div");
    grid.className = "emoji-grid";
    
    emojis.forEach(emoji => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-picker-btn";
        btn.textContent = emoji;
        btn.addEventListener("click", () => {
            insertAtCursor(messageInput, emoji);
            addRecentEmoji(emoji);
            emojiPopover.classList.add("d-none");
            messageInput.focus();
            
            // Trigger manual input event to emit typing status
            const event = new Event('input', { bubbles: true });
            messageInput.dispatchEvent(event);
        });
        grid.appendChild(btn);
    });
    
    section.appendChild(grid);
    return section;
}

// Emoji Picker open/close
emojiTriggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = emojiPopover.classList.contains("d-none");
    if (isHidden) {
        renderEmojiGrid();
        emojiPopover.classList.remove("d-none");
        document.getElementById("emojiSearchInput").value = "";
        document.getElementById("emojiSearchInput").focus();
        updateActiveTab("recent");
    } else {
        emojiPopover.classList.add("d-none");
    }
});

document.addEventListener("click", (e) => {
    if (!emojiPopover.classList.contains("d-none") && !emojiPopover.contains(e.target) && e.target !== emojiTriggerBtn) {
        emojiPopover.classList.add("d-none");
    }
});

// Search input
document.getElementById("emojiSearchInput").addEventListener("input", (e) => {
    renderEmojiGrid(e.target.value);
});

// Category tab clicks
document.getElementById("emojiCategoryTabs").addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".emoji-tab-btn");
    if (!tabBtn) return;
    
    const category = tabBtn.dataset.category;
    updateActiveTab(category);
    
    // Clear search
    document.getElementById("emojiSearchInput").value = "";
    renderEmojiGrid();
    
    // Scroll to section
    const container = document.getElementById("emojiGridContainer");
    const section = container.querySelector(`.emoji-section[data-category="${category}"]`);
    if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
});

// Track scroll to update active tab
document.getElementById("emojiGridContainer").addEventListener("scroll", () => {
    const container = document.getElementById("emojiGridContainer");
    const sections = container.querySelectorAll(".emoji-section");
    let activeCategory = null;
    
    for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top <= containerRect.top + 40) {
            activeCategory = section.dataset.category;
        }
    }
    
    if (activeCategory) {
        updateActiveTab(activeCategory);
    }
});

function updateActiveTab(category) {
    const tabs = document.querySelectorAll(".emoji-tab-btn");
    tabs.forEach(tab => {
        tab.classList.toggle("active", tab.dataset.category === category);
    });
}

// Upload Trigger buttons
imageTriggerBtn.addEventListener("click", () => {
    imageFileInput.click();
});

fileTriggerBtn.addEventListener("click", () => {
    generalFileInput.click();
});

imageFileInput.addEventListener("change", () => {
    if (imageFileInput.files.length > 0) {
        const file = imageFileInput.files[0];
        const extension = file.name.split('.').pop().toLowerCase();
        if (!["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) {
            showComposerErrorBanner("Only JPG, JPEG, PNG, GIF, and WEBP image files are allowed.");
            imageFileInput.value = "";
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showComposerErrorBanner("Image size exceeds 5MB limit.");
            imageFileInput.value = "";
            return;
        }
        displayImagePreview(file);
    }
});

generalFileInput.addEventListener("change", () => {
    if (generalFileInput.files.length > 0) {
        const file = generalFileInput.files[0];
        const extension = file.name.split('.').pop().toLowerCase();
        if (!["pdf", "docx", "txt", "zip"].includes(extension)) {
            showComposerErrorBanner("Only PDF, DOCX, TXT, and ZIP documents are allowed.");
            generalFileInput.value = "";
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showComposerErrorBanner("File size exceeds 10MB limit.");
            generalFileInput.value = "";
            return;
        }
        startUpload(file, false);
        generalFileInput.value = "";
    }
});

// Image Preview panel actions
imagePreviewCancelBtn.addEventListener("click", () => {
    clearImagePreview();
    imageFileInput.value = "";
});

imagePreviewSendBtn.addEventListener("click", () => {
    if (pendingImageFile) {
        startUpload(pendingImageFile, true);
        clearImagePreview();
        imageFileInput.value = "";
    }
});

// Drag & Drop
const dragTarget = document.querySelector(".chat-main-panel");
const dropOverlay = document.getElementById("dragDropOverlay");

dragTarget.addEventListener("dragenter", e => {
    e.preventDefault();
    if (connection.state !== signalR.HubConnectionState.Connected) return;
    dropOverlay.classList.add("active");
});

dropOverlay.addEventListener("dragover", e => {
    e.preventDefault();
});

dropOverlay.addEventListener("dragleave", e => {
    e.preventDefault();
    dropOverlay.classList.remove("active");
});

dropOverlay.addEventListener("drop", e => {
    e.preventDefault();
    dropOverlay.classList.remove("active");
    
    if (connection.state !== signalR.HubConnectionState.Connected) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        validateAndProcessDroppedFile(files[0]);
    }
});

// Dynamic Avatar lookup
function getUserAvatar(userName) {
    const mockAvatars = {
        "john": "https://lh3.googleusercontent.com/aida-public/AB6AXuC15QDsrK6_0ocdfiilQpLudahmvKsweDjJ8WqbegwWaLl39D5jzQhm5x_ru9XBA5SnFa-u1xCNvF9gGSqWI2Qh09Yq2eVVwWxXt5b3wR79mimKWvugYoJGY-0y32DrXAn_ADqrxsNF5-W6DoBJWubedqNHi5eYfOVMnKzArshJ2tiVz_r7Oz8VpV-me4gsUsK4VqLUpENoziZOzOIRQeCq0jKspRkeANOxJR-UgaMDylekax7r3urwiqM-R9RY_FLGhKyu7uQAoFU",
        "vy": "https://lh3.googleusercontent.com/aida-public/AB6AXuB-iQ0Y2LFhHfvRzhCbPFOST5GFrXahVIGe3eeimLyolj9KhDWUOmk-SYi2MfnJB74f-uzM3SuNG4nssL0JIPoBAeJKJ7T1VJHwW23731ZX-Hb1Luxu2YBU7m2YFO73Xo38K2W54SnSvQpTsbYeOozYFJ8MKmVdt1Svi1Cvl77Q7k8mJvyUwwVJZQgEKyYcJrFVlQ4EZcXDptAeAB1VQufPuDLk4OGET5XTiUxUXGkM9SKGEobI7b9UMkfk5GDCOIkTqroOkw4pKSM",
        "nam": "https://lh3.googleusercontent.com/aida-public/AB6AXuD9NN3qxAN7TIClUy_Xau_x7DF6PIhcC4Qgj92kkgdE-bXneVMA1EFMQchg1bZ6b_xSAvsQ8T9txCIlK2Ah41_ExRa5nG-ZNs-qROOxrbo7dO3buVlgFFMa9uDjijoABx3ytuk2mR0XldovMPKWTAxaERmxjXgXSJE3SSpGHK5CZGAE9JSdSn764vxXFF3vQ8XKDFhDy4BDY6PZTfWQeWGLjEOvmWRiM809Y8Il4wgk64r9De9KEGxGQruMaoMEwgHMFAcoosdxkqQ",
        "hao": "https://lh3.googleusercontent.com/aida-public/AB6AXuCpbTLcJlr8MhU9KbzDh3iJQaa9aciFu41B7oWyzQTqYIAa3vjJVzJ-4HfH2ZCdxpK4bPL61v8IJKHYqpFFtm-a2r58fO8XxdCl7slncXELRSS7ArkTNGxOVDs-lD4DG08bc-KYdQB76F92gAbde4BXDCPrJyZDXUjDvpXR1PXQ4KwamDQHrdWORoek-EFU38KxqflrN5_g4Fjg66dxApQ4Dfme2Gk4SgCTxQ0QV3ingcYDZ4QZigLp5HQwqWILtHWj1DVve9ILkyE"
    };
    
    const key = userName.toLowerCase().trim();
    if (mockAvatars[key]) {
        return mockAvatars[key];
    }
    
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=0057cd&color=ffffff&size=128`;
}

// Scroll layout alignment
function scrollMessagesToBottom(force = false) {
    const threshold = 100;
    const isNearBottom = (messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight) <= threshold;
    if (force || isNearBottom) {
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}

// Onboarding card checks
function checkEmptyState() {
    const emptyState = document.getElementById("emptyState");
    const hasMessages = messagesList.querySelectorAll(".message-bubble-container, .system-msg-pill").length > 0;
    if (hasMessages) {
        emptyState?.classList.add("d-none");
    } else {
        emptyState?.classList.remove("d-none");
    }
}

// Typing indicators UI render
function renderTypingStatus() {
    const typersAlert = document.getElementById("typersAlert");
    if (activeTypers.length === 0) {
        typersAlert.innerHTML = "";
        return;
    }
    
    let text = "";
    if (activeTypers.length === 1) {
        text = `<strong>${escapeHtml(activeTypers[0])}</strong> is typing`;
    } else if (activeTypers.length === 2) {
        text = `<strong>${escapeHtml(activeTypers[0])}</strong> and <strong>${escapeHtml(activeTypers[1])}</strong> are typing`;
    } else {
        text = `<strong>${escapeHtml(activeTypers[0])}</strong> and ${activeTypers.length - 1} others are typing`;
    }
    
    typersAlert.innerHTML = `
        <div class="typing-indicator-dots">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
        </div>
        <span class="ms-1" style="font-size: 0.75rem;">${text}...</span>
    `;
}

// Upload progress cards manager
function startUpload(file, isImage) {
    const uploadId = "upload_" + (++uploadIdCounter);
    const container = document.getElementById("uploadPanelContainer");
    
    const card = document.createElement("div");
    card.id = uploadId;
    card.className = "upload-progress-card";
    
    const icon = isImage ? "image" : "description";
    const sizeFormatted = formatBytes(file.size);
    
    card.innerHTML = `
        <span class="material-symbols-outlined text-secondary fs-3 flex-shrink-0">${icon}</span>
        <div class="flex-grow-1 min-w-0">
            <div class="text-dark small text-truncate fw-semibold mb-1">${escapeHtml(file.name)}</div>
            <div class="progress" style="height: 6px;">
                <div class="progress-bar" role="progressbar" style="width: 0%"></div>
            </div>
            <div class="d-flex justify-content-between mt-1" style="font-size: 0.7rem;">
                <span class="text-muted status-text">Uploading (${sizeFormatted})...</span>
                <span class="text-primary percent-text">0%</span>
            </div>
        </div>
        <button class="btn btn-link p-1 text-danger btn-cancel-upload flex-shrink-0" type="button" style="line-height: 1;">
            <span class="material-symbols-outlined fs-5">close</span>
        </button>
    `;
    
    container.appendChild(card);
    
    const cancelBtn = card.querySelector(".btn-cancel-upload");
    cancelBtn.addEventListener("click", () => {
        if (activeXHRs[uploadId]) {
            activeXHRs[uploadId].abort();
        }
    });

    const formData = new FormData();
    const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
    formData.append("uploadFile", file);
    formData.append("userName", currentUserName);

    const xhr = new XMLHttpRequest();
    activeXHRs[uploadId] = xhr;

    xhr.open("POST", `${window.location.origin}/Chat?handler=Upload`);
    if (token) {
        xhr.setRequestHeader("RequestVerificationToken", token);
    }

    xhr.upload.onprogress = event => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        
        const progressBar = card.querySelector(".progress-bar");
        const percentText = card.querySelector(".percent-text");
        progressBar.style.width = `${percent}%`;
        percentText.textContent = `${percent}%`;
    };

    xhr.onload = () => {
        delete activeXHRs[uploadId];
        if (xhr.status < 200 || xhr.status >= 300) {
            markUploadFailed(card, "Upload failed");
            return;
        }

        let response;
        try {
            response = JSON.parse(xhr.responseText);
        } catch {
            markUploadFailed(card, "Server returned an invalid response");
            return;
        }

        if (!response.success) {
            markUploadFailed(card, response.message);
            return;
        }

        markUploadSuccess(card);
    };

    xhr.onerror = () => {
        delete activeXHRs[uploadId];
        markUploadFailed(card, "Network error");
    };

    xhr.onabort = () => {
        delete activeXHRs[uploadId];
        markUploadCancelled(card);
    };

    xhr.send(formData);
}

function markUploadSuccess(card) {
    card.classList.add("success");
    const progressBar = card.querySelector(".progress-bar");
    const statusText = card.querySelector(".status-text");
    const percentText = card.querySelector(".percent-text");
    const cancelBtn = card.querySelector(".btn-cancel-upload");
    
    progressBar.style.width = "100%";
    progressBar.classList.add("bg-success");
    statusText.textContent = "Upload completed";
    percentText.innerHTML = `<span class="material-symbols-outlined text-success fs-5">check_circle</span>`;
    if (cancelBtn) cancelBtn.style.display = "none";
    
    setTimeout(() => {
        card.style.opacity = "0";
        setTimeout(() => card.remove(), 300);
    }, 2000);
}

function markUploadFailed(card, reason) {
    card.classList.add("failed");
    const progressBar = card.querySelector(".progress-bar");
    const statusText = card.querySelector(".status-text");
    const percentText = card.querySelector(".percent-text");
    const cancelBtn = card.querySelector(".btn-cancel-upload");
    
    progressBar.classList.add("bg-danger");
    statusText.textContent = `Error: ${reason}`;
    percentText.innerHTML = `<span class="material-symbols-outlined text-danger fs-5">warning</span>`;
    if (cancelBtn) cancelBtn.style.display = "none";
    
    setTimeout(() => {
        card.style.opacity = "0";
        setTimeout(() => card.remove(), 4000);
    }, 4000);
}

function markUploadCancelled(card) {
    card.classList.add("cancelled");
    const progressBar = card.querySelector(".progress-bar");
    const statusText = card.querySelector(".status-text");
    const percentText = card.querySelector(".percent-text");
    const cancelBtn = card.querySelector(".btn-cancel-upload");
    
    progressBar.classList.add("bg-secondary");
    statusText.textContent = "Upload cancelled";
    percentText.textContent = "";
    if (cancelBtn) cancelBtn.style.display = "none";
    
    setTimeout(() => {
        card.style.opacity = "0";
        setTimeout(() => card.remove(), 1000);
    }, 1000);
}

// Drag & Drop validation processing
function validateAndProcessDroppedFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(extension);
    const isDoc = ["pdf", "docx", "txt", "zip"].includes(extension);
    
    if (!isImage && !isDoc) {
        showComposerErrorBanner("Invalid file type. Only JPG, PNG, GIF, WEBP, PDF, DOCX, TXT, and ZIP are allowed.");
        return;
    }
    
    if (isImage && file.size > 5 * 1024 * 1024) {
        showComposerErrorBanner("Image size exceeds 5MB limit.");
        return;
    }
    
    if (isDoc && file.size > 10 * 1024 * 1024) {
        showComposerErrorBanner("File size exceeds 10MB limit.");
        return;
    }
    
    if (isImage) {
        displayImagePreview(file);
    } else {
        startUpload(file, false);
    }
}

function showComposerErrorBanner(msg) {
    const alertDiv = document.createElement("div");
    alertDiv.className = "alert alert-danger alert-dismissible fade show p-2 mb-2 small";
    alertDiv.setAttribute("role", "alert");
    alertDiv.innerHTML = `
        <span>${escapeHtml(msg)}</span>
        <button type="button" class="btn-close p-2" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    const container = document.getElementById("uploadPanelContainer");
    container.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.classList.remove("show");
        setTimeout(() => alertDiv.remove(), 150);
    }, 4000);
}

function displayImagePreview(file) {
    pendingImageFile = file;
    const previewImg = document.getElementById("imagePreviewImg");
    const previewName = document.getElementById("imagePreviewName");
    const previewSize = document.getElementById("imagePreviewSize");
    
    previewImg.src = URL.createObjectURL(file);
    previewName.textContent = file.name;
    previewSize.textContent = formatBytes(file.size);
    
    imagePreviewCard.classList.remove("d-none");
    messageInput.disabled = true; // Lock textarea
}

function clearImagePreview() {
    pendingImageFile = null;
    imagePreviewCard.classList.add("d-none");
    
    if (connection.state === signalR.HubConnectionState.Connected) {
        messageInput.disabled = false;
        messageInput.focus();
    }
}

// Appenders for messages
function appendTextMessage(userName, message, sentAt) {
    const isMe = userName === currentUserName;
    const directionClass = isMe ? "outgoing" : "";
    const nameAlignment = isMe ? "flex-row-reverse text-end" : "";
    const avatarUrl = getUserAvatar(userName);
    
    const readReceipt = isMe ? `
        <div class="d-flex align-items-center gap-1 mt-1 justify-content-end">
            <span class="material-symbols-outlined text-primary" style="font-size: 14px; font-variation-settings: 'FILL' 1;">done_all</span>
            <span class="text-muted" style="font-size: 0.75rem;">Read</span>
        </div>
    ` : "";

    const item = document.createElement("div");
    item.className = `message-bubble-container ${directionClass}`;
    item.innerHTML = `
        <div class="user-avatar-wrapper flex-shrink-0">
            <img class="user-avatar" src="${avatarUrl}" alt="${escapeHtml(userName)} avatar" />
        </div>
        <div class="d-flex flex-column gap-1 overflow-hidden">
            <div class="d-flex align-items-baseline gap-2 ${nameAlignment}">
                <span class="fw-bold text-dark small">${escapeHtml(userName)}</span>
                <span class="text-muted" style="font-size: 0.7rem;">${escapeHtml(sentAt)}</span>
            </div>
            <div class="message-bubble">
                <p class="m-0 text-wrap text-break" style="white-space: pre-wrap; font-size: 0.875rem;">${escapeHtml(message)}</p>
            </div>
            ${readReceipt}
        </div>
    `;
    appendMessageElement(item, isMe);
}

function appendImageMessage(userName, fileName, fileUrl, uploadedAt) {
    const isMe = userName === currentUserName;
    const directionClass = isMe ? "outgoing" : "";
    const nameAlignment = isMe ? "flex-row-reverse text-end" : "";
    const avatarUrl = getUserAvatar(userName);
    
    const readReceipt = isMe ? `
        <div class="d-flex align-items-center gap-1 mt-1 justify-content-end">
            <span class="material-symbols-outlined text-primary" style="font-size: 14px; font-variation-settings: 'FILL' 1;">done_all</span>
            <span class="text-muted" style="font-size: 0.75rem;">Read</span>
        </div>
    ` : "";

    const item = document.createElement("div");
    item.className = `message-bubble-container ${directionClass}`;
    item.innerHTML = `
        <div class="user-avatar-wrapper flex-shrink-0">
            <img class="user-avatar" src="${avatarUrl}" alt="${escapeHtml(userName)} avatar" />
        </div>
        <div class="d-flex flex-column gap-1" style="min-width:0; max-width: 320px;">
            <div class="d-flex align-items-baseline gap-2 ${nameAlignment}">
                <span class="fw-bold text-dark small">${escapeHtml(userName)}</span>
                <span class="text-muted" style="font-size: 0.7rem;">${escapeHtml(uploadedAt)}</span>
            </div>
            <div class="message-bubble p-2">
                <a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener" style="display:block;">
                    <img class="chat-attached-image" src="${escapeHtml(fileUrl)}" alt="${escapeHtml(fileName)}" />
                </a>
                <div class="text-muted mt-1 small text-truncate" style="font-size: 0.75rem;">${escapeHtml(fileName)}</div>
            </div>
            ${readReceipt}
        </div>
    `;
    appendMessageElement(item, isMe);
}

function appendFileMessage(userName, fileName, fileUrl, uploadedAt) {
    const isMe = userName === currentUserName;
    const directionClass = isMe ? "outgoing" : "";
    const nameAlignment = isMe ? "flex-row-reverse text-end" : "";
    const avatarUrl = getUserAvatar(userName);
    
    const readReceipt = isMe ? `
        <div class="d-flex align-items-center gap-1 mt-1 justify-content-end">
            <span class="material-symbols-outlined text-primary" style="font-size: 14px; font-variation-settings: 'FILL' 1;">done_all</span>
            <span class="text-muted" style="font-size: 0.75rem;">Read</span>
        </div>
    ` : "";

    const item = document.createElement("div");
    item.className = `message-bubble-container ${directionClass}`;
    item.innerHTML = `
        <div class="user-avatar-wrapper flex-shrink-0">
            <img class="user-avatar" src="${avatarUrl}" alt="${escapeHtml(userName)} avatar" />
        </div>
        <div class="d-flex flex-column gap-1 overflow-hidden">
            <div class="d-flex align-items-baseline gap-2 ${nameAlignment}">
                <span class="fw-bold text-dark small">${escapeHtml(userName)}</span>
                <span class="text-muted" style="font-size: 0.7rem;">${escapeHtml(uploadedAt)}</span>
            </div>
            <div class="chat-attached-file-card">
                <span class="material-symbols-outlined text-primary fs-3">description</span>
                <div class="flex-grow-1 min-w-0">
                    <div class="text-dark small text-truncate fw-semibold">${escapeHtml(fileName)}</div>
                    <span class="text-muted" style="font-size: 0.7rem;">File attachment</span>
                </div>
                <a href="${escapeHtml(fileUrl)}" download class="btn btn-link p-1 text-primary">
                    <span class="material-symbols-outlined fs-4">download</span>
                </a>
            </div>
            ${readReceipt}
        </div>
    `;
    appendMessageElement(item, isMe);
}

function appendSystemMessage(message) {
    const item = document.createElement("div");
    item.className = "d-flex justify-content-center my-2";
    item.innerHTML = `
        <div class="system-msg-pill">
            <span class="material-symbols-outlined text-secondary" style="font-size: 14px;">info</span>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    appendMessageElement(item, false);
}

function appendMessageElement(item, isMeSender) {
    messagesList.appendChild(item);
    scrollMessagesToBottom(isMeSender);
    checkEmptyState();
}

function hasRenderedEvent(eventId) {
    if (!eventId) {
        return false;
    }

    if (renderedEventIds.has(eventId)) {
        return true;
    }

    renderedEventIds.add(eventId);

    if (renderedEventIds.size > 500) {
        const oldestEventId = renderedEventIds.values().next().value;
        renderedEventIds.delete(oldestEventId);
    }

    return false;
}

function renderOnlineUsers(users) {
    const onlineUsersList = document.getElementById("onlineUsersList");
    onlineUsersList.innerHTML = "";

    const sortedUsers = [...users].sort((a, b) => {
        if (a.userName === currentUserName) return -1;
        if (b.userName === currentUserName) return 1;
        return a.userName.localeCompare(b.userName);
    });

    const connectionStatusText = document.getElementById("connectionStatusText");
    if (connection.state === signalR.HubConnectionState.Connected) {
        connectionStatusText.textContent = `${users.length} Users Online`;
    }

    sortedUsers.forEach(user => {
        const isMe = user.userName === currentUserName;
        const btn = document.createElement("button");
        btn.className = "user-sidebar-btn d-flex align-items-center gap-3";
        if (isMe) {
            btn.classList.add("active-user");
        }
        
        const avatarUrl = getUserAvatar(user.userName);
        const meBadge = isMe ? `<span class="badge bg-primary text-white ms-auto py-1 px-2 rounded-pill" style="font-size: 0.65rem;">You</span>` : "";

        btn.innerHTML = `
            <div class="user-avatar-wrapper flex-shrink-0">
                <img class="user-avatar" src="${avatarUrl}" alt="${escapeHtml(user.userName)} avatar" />
                <span class="user-status-dot status-dot-online"></span>
            </div>
            <span class="small truncate text-truncate" style="max-width: 140px;">${escapeHtml(user.userName)}</span>
            ${meBadge}
        `;
        onlineUsersList.appendChild(btn);
    });
}

// Helpers
function insertAtCursor(input, value) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const before = input.value.substring(0, start);
    const after = input.value.substring(end);

    input.value = `${before}${value}${after}`;
    input.selectionStart = input.selectionEnd = start + value.length;
}

function setChatEnabled(isEnabled) {
    messageInput.disabled = !isEnabled || pendingImageFile !== null;
    sendButton.disabled = !isEnabled;
    emojiTriggerBtn.disabled = !isEnabled;
    imageTriggerBtn.disabled = !isEnabled;
    fileTriggerBtn.disabled = !isEnabled;
    
    // Disable drag drop behaviors conditionally
    if (!isEnabled) {
        dropOverlay.classList.remove("active");
    }
}

function setConnectionStatus(text, isOnline, state) {
    const dot = document.getElementById("connectionDot");
    const statusText = document.getElementById("connectionStatusText");
    
    statusText.textContent = text;
    
    dot.className = "rounded-circle";
    
    if (state === "Connected") {
        dot.classList.add("status-dot-online");
        setChatEnabled(true);
    } else if (state === "Reconnecting") {
        dot.classList.add("status-dot-away");
        setChatEnabled(false);
    } else {
        dot.classList.add("status-dot-busy");
        setChatEnabled(false);
    }
}

function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
