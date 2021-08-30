const settings = require("./local.settings.json");
const fetch = require("node-fetch");

const jUrl = settings.jellyfin.apiUrl;
const jKey = settings.jellyfin.apiKey;

async function getUsers() {
  const resp = await fetch(`${jUrl}/users?api_key=${jKey}`);
  const data = (await resp.json());

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    console.log(`"${item.Name}": ${item.Id}`)
  }
}

getUsers();