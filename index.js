const fs = require("fs");
const spawnObj = require('child_process').spawn;
const path = require("path");
const jellyfinUtils = require("./jellyfinUtils.js");
const movieDbUtils = require("./movieDbUtils.js");
const settings = require("./local.settings.json");

const outputFilename = settings.outputHtml
  ? "./output.html"
  : "./output.txt";
const ignoreFn = "./ignored-shows.json";
const allShowsFn = "./all-shows.json";
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let ignoredJellyfinShows = [];

if (fs.existsSync(ignoreFn)) {
  const ignoredJson = fs.readFileSync(ignoreFn, 'utf8');
  ignoredJellyfinShows = JSON.parse(ignoredJson);
}

// New episode info.
const newEps = [];
// Next episode info for shows that I have up-to-date.
const nextAirs = [];
// Errors that might have occurred.
const errors = [];
// The TMDB ids and names of shows that have permanently ended.
const endedShows = [];

const allShows = [];

async function runUpdate() {
  await processAllShows();

  writeOutput();

  if (ignoredJellyfinShows.length
    && settings.ignoreEndedShows) {
    // Write out the shows to ignore next time.
    fs.writeFileSync(ignoreFn,
      JSON.stringify(ignoredJellyfinShows.sort((a, b) => a.name < b.name ? -1 : 1), null, 2),
      'utf8')

    log(`Ignored list updated in ${ignoreFn}.`);
  }

  fs.writeFileSync(allShowsFn,
    JSON.stringify(allShows.sort((a, b) => a.name < b.name ? -1 : 1), null, 2),
    'utf8');

  log(`All shows written to ${allShowsFn}.`);

  if (settings.spawnWhenFinished.enabled) {
    progToOpen = spawnObj(settings.spawnWhenFinished.program,
      [path.resolve(outputFilename)], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  }
}

async function processAllShows() {
  const shows = await jellyfinUtils.getAllJellyfinShows();

  let showsToProcess = [];

  for (let i = 0; i < shows.length; i++) {
    allShows.push({
      id: shows[i].Id,
      name: shows[i].Name,
    });

    if (settings.ignoreEndedShows
      && ignoredJellyfinShows.some(x => x.id === shows[i].Id)) {
      // Ignore this show. (Skip it.)
      continue;
    }

    showsToProcess.push(shows[i]);
  }

  log(`Processing ${showsToProcess.length} show(s). ${allShows.length - showsToProcess.length} show(s) ignored.`);

  for (let i = 0; i < showsToProcess.length; i++) {
    log(`(${i + 1}/${showsToProcess.length}) Processing '${showsToProcess[i].Name}'.`);
    await processShow(showsToProcess[i]);
  }

  log("Finished processing.");
}

async function processShow(show) {
  const latestEp = await jellyfinUtils.getNewestEpisode(show.Id);
  if (!latestEp) {
    return;
  }

  const myNewest = latestEp
    ? latestEp.shorthand
    : '';

  if (myNewest == '') {
    errors.push(`${show.Name} doesn't seem to have any episodes in Jellyfin.`);
    return;
  }

  const tmdb = show.ProviderIds
    ? show.ProviderIds.Tmdb
    : null;

  if (!tmdb) {
    errors.push(`${show.Name} doesn't have a TMDB Id.`);
    return;
  }

  try {
    const dbInfo = await movieDbUtils.getLatestEpFromMovieDb(tmdb);

    if (dbInfo.newestEp !== myNewest) {
      newEps.push({
        jellyfinId: show.Id,
        text: `${show.Name} ${myNewest} → ${dbInfo.newestEp}`,
        show: show.Name,
        myNewest,
        newestEp: dbInfo.newestEp,
      });
    } else if (dbInfo.nextEp) {
      nextAirs.push({
        jellyfinId: show.Id,
        text: `${show.Name} ${myNewest} → ${dbInfo.nextEp.ep}`,
        show: show.Name,
        myNewest,
        nextEp: dbInfo.nextEp.ep,
        air_date: dbInfo.nextEp.air_date,
      });
    } else if (dbInfo.status === 'Ended'
      || dbInfo.status === 'Canceled') {
      endedShows.push({
        jellyfinId: show.Id,
        text: show.Name,
        show: show.Name,
      });
      ignoredJellyfinShows.push({
        name: show.Name,
        id: show.Id,
        jellyfinId: show.Id,
      });
    }

  } catch (err) {
    errors.push(`${show.Name} failed to get TMDB info: ${err}`);
  }
}

function sortByTextProp(a, b) {
  return a.text < b.text ? -1 : 1;
}

function groupBy(xs, key) {
  return xs.reduce(function (rv, x) {
    let v = key instanceof Function
      ? key(x)
      : x[key];
    let el = rv.find((r) => r && r.key === v);
    if (el) {
      el.values.push(x);
    } else {
      rv.push({
        key: v,
        values: [x],
      });
    }
    return rv;
  },
    []);
}

function strToDate(dateStr) {
  const parts = dateStr.split("-");
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatTMDBDate(dateStr) {
  return `${days[strToDate(dateStr).getDay()]}, ${dateStr}`;
}

function writeOutput() {
  let output = '';

  if (settings.outputHtml) {
    output = getOutputHtml();
    output += `<br /><br />Last run: ${new Date()}`;
  } else {
    output = getOutputText();
    output += `\n\nLast run: ${new Date()}`;
  }

  fs.writeFileSync(outputFilename, output, 'utf8');

  log(`Output written to ${outputFilename}.`);

  writeOutputJson();
}

function getOutputText() {
  let output = '';

  output += '=== NEW EPISODES ==============================\n';
  output += newEps.sort(sortByTextProp).map(x => x.text).join('\n');
  output += '\n\n';

  output += '=== UPCOMING EPS ==============================\n';
  groupBy(nextAirs, "air_date")
    .sort((a, b) => a.key < b.key ? -1 : 1)
    .forEach(group => {
      output += `${formatTMDBDate(group.key)} (${getDaysTil(strToDate(group.key))})::\n${group.values
        .sort((a, b) => a.text < b.text ? -1 : 1)
        .map(x => '  ' + x.text)
        .join('\n')}\n\n`;
    });
  output += '\n\n';

  output += '=== ENDED SHOWS ===============================\n';
  output += endedShows.sort(sortByTextProp).map(x => x.text).join('\n');
  output += '\n\n';

  output += '=== ERRORS ====================================\n';
  output += errors.sort(sortByTextProp).join('\n');
  output += '\n\n';

  return output;
}

function getOutputHtml() {
  let output = '';

  if (settings.outputHtmlTemplate
    && fs.existsSync(settings.outputHtmlTemplate)) {
    output = fs.readFileSync(settings.outputHtmlTemplate, 'utf8');
  } else if (fs.existsSync("./outputTemplate.html")) {
    output = fs.readFileSync("./outputTemplate.html", 'utf8');
  } else {
    throw new Error("No output html template defined and could not find ./outputTemplate.html!");
  }

  output = output.replace(/#NewEpisodes#/g,
    newEps
      .sort(sortByTextProp)
      .map(x => `<span class="ep-line">
        <span class="show">${x.show}</span>
        <span class="ep">${x.myNewest} → ${settings.linkTo
          ? `<a href="${settings.linkTo.replace("%s", `${x.show} ${x.newestEp}`)}">${x.newestEp}</a>`
          : `${x.newestEp}`
        }</span>
      </span>`)
      .join('') || "");

  output = output.replace(/#UpcomingEpisodes#/g,
    groupBy(nextAirs, "air_date")
      .sort((a, b) => a.key < b.key ? -1 : 1)
      .map(group => `<div class="upcoming-eps">
          <span class="date">${formatTMDBDate(group.key)} (${getDaysTil(strToDate(group.key))})</span>
          <ul>
          ${group.values
          .sort((a, b) => a.show < b.show ? -1 : 1)
          .map(x => `<li class="ep-line"><span class="show">${x.show}</span> <span class="ep">${x.myNewest} → <a href="${settings.linkTo.replace("%s", `${x.show} ${x.nextEp}`)}">${x.nextEp}</a></span></li>`)
          .join('')
        }
        </ul>
        </div>`)
      .join('') || "");

  output = output.replace(/#EndedShows#/g,
    endedShows.sort(sortByTextProp).map(x => x.text).join('<br />') || "");

  output = output.replace(/#Errors#/g,
    errors.sort(sortByTextProp).join('<br />') || "");

  return output;
}

function writeOutputJson() {
  let outputShows = newEps.map(x => ({
    jellyfinId: x.jellyfinId,
    show: x.show,
    jellyfinLatestEpisode: x.myNewest,
    availableEpisode: x.newestEp,
    upcomingEpisode: null,
    upcomingEpisodeAirDate: null,
    status: "available",
  })).concat(nextAirs.map(x => ({
    jellyfinId: x.jellyfinId,
    show: x.show,
    jellyfinLatestEpisode: x.myNewest,
    availableEpisode: null,
    upcomingEpisode: x.nextEp,
    upcomingEpisodeAirDate: x.air_date,
    status: "upcoming",
  }))).concat(endedShows.map(x => ({
    jellyfinId: x.jellyfinId,
    show: x.show,
    jellyfinLatestEpisode: null,
    availableEpisode: null,
    upcomingEpisode: null,
    upcomingEpisodeAirDate: null,
    status: "ended",
  }))).concat(ignoredJellyfinShows.map(x => ({
    jellyfinId: x.id,
    show: x.name,
    jellyfinLatestEpisode: null,
    availableEpisode: null,
    upcomingEpisode: null,
    upcomingEpisodeAirDate: null,
    status: "ignored",
  })));

  fs.writeFileSync("./output.json",
    JSON.stringify({
      shows: outputShows,
      lastRunErrors: errors,
      lastRun: new Date(),
    }, null, 2),
    "utf8");
}

function getDaysTil(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const numDays = Math.floor((date - today) / (1000 * 3600 * 24));
  return `${numDays} day${numDays === 1 ? "" : "s"}`;
}

function log(message) {
  // Log out to the console.
  console.log(message);
  // In case running as a child process, notify the caller.
  if (process
    && process.send) {
    process.send(message);
  }
}

runUpdate();