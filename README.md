# episode-updater
Reports on new episodes, upcoming episodes, and ended shows from the Jellyfin library via its API. Retrieves info from TheMovieDB.

# local.settings.json
Reads settings from a file located at `./local.settings.json`. It must have the following schema:

```
{
  "movieDbApiKey": "<your TheMovieDb Api key>",
  "jellyfin": {
    "apiUrl": "<your Jellyfin server url>",
    "apiKey": "<your Jellyfin API key>",
    "userId": "<your Jellyfin user Id>",
    "tvShowFolderId": "<Your Jellyfin tv show folder Id>"
  }
}
```