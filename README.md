# jellyfin-new-episode-report
Connects to a Jellyfin server via the Jellyfin API to read the list of TV shows. Then, for each TV show, it will retrieve the latest & upcoming episode info from TheMovieDB.

It will then output a report showing the newest available episode for each TV show (if it's not already in the Jellyfin library), the next episode that will be aired (if there is one upcoming), or that a show has ended or been canceled. Ended/canceled shows will then be ignored on subsequent runs.

# Requirements & Set-up
- A **Jellyfin server**.
- A **Jellyfin API key**.
  - Go to the Jellyfin server's Admin Dashboard > API Keys, then create one.
- Your **Jellyfin userId**.
  - See [Getting User Ids below](#getting-user-ids).
- Your **Jellyfin TVShow library id**.
  - See [Getting Library Ids below](#getting-library-ids).
- A **TheMovieDB API key**.
  - Go to https://themoviedb.org, create an account, visit Settings > API and request an API key.

Since this is a node script, you must have nodejs installed.

Navigate to the script's folder and execute `npm install` to install the script dependencies.

# local.settings.json
The script reads settings from a required file located at `./local.settings.json`. You must create this json file. It must have the following schema:

```
{
  "movieDbApiKey": "<your TheMovieDb Api key>",
  "jellyfin": {
    "apiUrl": "<your Jellyfin server url, e.g. http://192.168.1.144:8096>",
    "apiKey": "<your Jellyfin API key>",
    "userId": "<your Jellyfin user Id>",
    "tvShowFolderId": "<Your Jellyfin tv show folder Id>"
  },
  "spawnWhenFinished": {
    "enabled": <true or false>,
    "program": "<path to program to spawn, e.g. C:\\Windows\\notepad.exe>"
  },
  "outputHtml": <true or false>,
  "outputHtmlTemplate": "<path to html template>"
}
```

# Running
Simply clone the entire repo and run `npm start` (or `node .\index.js`) at its location. It will output its progress to the terminal and, when done, output the info to `./output.txt`. Any TV shows that were ended or canceled will be outputted to `./ignored-shows.json`. Additionally, the entire list of show Id/Names will be outputted to `./all-shows.json` for the user to view.

Once completed, if the `local.settings.json` file has `spawnWhenFinished.enabled` == true, it will spawn a child process to the program specified in `spawnWhenFinished.program` and pass the `./output.txt` file in as a parameter. On Windows, you could set this to `C:\\Windows\\notepad.exe` to have it auto-open the outputted report.

If the option `outputHtml` is set to `true`, the output will instead be `./output.html`. In this case, it will read in `.\outputTemplate.html` and replace `#NewEpisodes#`, `#UpcomingEpisodes#`, `#EndedShows#` and `#Errors#` in the file with some formatted html. If you want to use a different html template, put its path into the settings called `outputHtmlTemplate`.

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

# Getting Library Ids
Run `npm run get-libraries` (or `node .\getLibraries.js`) in the script folder to connect to the Jellyfin server and output a list of Library names, types, and Ids.

This functionality requires the `local.settings.json` file to exist and to have the following properties already configured:

```
{
  ...
  "jellyfin": {
    "apiUrl": "<your Jellyfin server url, e.g. http://192.168.1.144:8096>",
    "apiKey": "<your Jellyfin API key>",
    "userId": "<your Jellyfin user Id>",
    ...
  },
  ...
}
```
The output will look like this:

```
"Music" (music): xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
"Movies" (movies): xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
"TV" (tvshows): xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

You can then copy the tv show library's Id into your `local.settings.json` file.

# Getting User Ids
Run `npm run get-users` (or `node .\getUsers.js`) in the script folder to connect to the Jellyfin server and output a list of user names and Ids.

This functionality requires the `local.settings.json` file to exist and to have the following properties already configured:

```
{
  ...
  "jellyfin": {
    "apiUrl": "<your Jellyfin server url, e.g. http://192.168.1.144:8096>",
    "apiKey": "<your Jellyfin API key>"
  },
  ...
}
```
The output will look like this:

```
"user1": xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
"user2": xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

You can then copy the desired user's Id into your `local.settings.json` file.