# jellyfin-new-episode-report
Connects to a Jellyfin server via the Jellyfin API to read the list of TV shows. Then, for each TV show, it will retrieve the latest & upcoming episode info from TheMovieDB.

It will then output a report showing the newest available episode for each TV show (if it's not already in the Jellyfin library), the next episode that will be aired (if there is one upcoming), or that a show has ended or been canceled. Ended/canceled shows will then be ignored on subsequent runs.

# Requirements & Set-up
- A Jellyfin server.
- A Jellyfin server API key.
- Your Jellyfin user id.
- Your Jellyfin TVShow folder id.
- A TheMovieDB API key.

Since this is a node script, you must have nodejs installed.

Navigate to the script's folder and execute `npm install` to install the script dependencies.

# local.settings.json
The script reads settings from a required file located at `./local.settings.json`. You must create this json file. It must have the following schema:

```
{
  "movieDbApiKey": "<your TheMovieDb Api key>",
  "jellyfin": {
    "apiUrl": "<your Jellyfin server url>",
    "apiKey": "<your Jellyfin API key>",
    "userId": "<your Jellyfin user Id>",
    "tvShowFolderId": "<Your Jellyfin tv show folder Id>"
  },
  "spawnWhenFinished": {
    "enabled": "<'true' or 'false'>",
    "program": "<path to program to spawn, e.g. C:\\Windows\\notepad.exe>"
  }
}
```

# Running
Simply clone the entire repo and run `npm start` at its location. It will output its progress to the terminal and, when done, output the info to `./output.txt`. Any TV shows that were ended or canceled will be outputted to `./ignored-shows.json`. Additionally, the entire list of show Id/Names will be outputted to `./all-shows.json` for the user to view.

Once completed, if the `local.settings.json` file has `spawnWhenFinished.enabled` == true, it will spawn a child process to the program specified in `spawnWhenFinished.program` and pass the `./output.txt` file in as a parameter. On Windows, you could set this to `C:\\Windows\\notepad.exe` to have it auto-open the outputted report.

# Ignoring Shows
Any shows put into `.\ignored-shows.json` will be skipped when processing the Jellyfin library. If the script detects that the Jellyfin library already has all the episodes for a show, that none are upcoming, AND that its status is 'Canceled' or 'Ended', it will automatically add it to this file to be ignored on subsequent runs.

```
[
  {
    name: "<show name here>",
    id: "<Jellyfin show Id>"
  }
]
```
