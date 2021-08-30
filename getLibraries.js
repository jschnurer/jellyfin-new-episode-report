const settings = require("./local.settings.json");
const fetch = require("node-fetch");

const jUrl = settings.jellyfin.apiUrl;
const jUserId = settings.jellyfin.userId;
const jKey = settings.jellyfin.apiKey;

async function getLibraries() {
  const resp = await fetch(`${jUrl}/users/${jUserId}/items/?api_key=${jKey}`);
  const data = (await resp.json());

  for (let i = 0; i < data.Items.length; i++) {
    const item = data.Items[i];
    console.log(`"${item.Name}" (${item.CollectionType}): ${item.Id}`)
  }
}

getLibraries();