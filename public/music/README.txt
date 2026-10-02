ADDING MUSIC
============

Put your audio files in this folder, then list them in tracks.json.
Everything here is served with the game, so it works offline and on a
filtered school network. Nothing is streamed from anywhere.


1. GET THE FILES
----------------

Free Music Archive (freemusicarchive.org) is a good source. Use the licence
filter and pick tracks you are allowed to use.

Check the licence on each individual track, not just the site. They vary per
upload. CC BY means you may use it as long as you credit the artist. CC BY-NC
means non-commercial only, which a classroom game is. CC BY-ND means no
derivatives - still fine to play as-is. Avoid anything marked "All rights
reserved".

Download the MP3 and drop it in this folder. Short filenames with no spaces
are easiest: artist-title.mp3


2. LIST THEM IN tracks.json
---------------------------

Stations are what the 1-9 keys and the FM dial select. Each station is a
playlist. Example with two stations:

{
  "stations": [
    {
      "name": "Synthwave",
      "tracks": [
        {
          "file": "someartist-neon-drive.mp3",
          "artist": "Some Artist",
          "title": "Neon Drive",
          "license": "CC BY 4.0",
          "url": "https://freemusicarchive.org/music/..."
        },
        {
          "file": "someartist-midnight.mp3",
          "artist": "Some Artist",
          "title": "Midnight",
          "license": "CC BY 4.0",
          "url": "https://freemusicarchive.org/music/..."
        }
      ]
    },
    {
      "name": "Chiptune",
      "tracks": [
        {
          "file": "chip-artist-level-one.mp3",
          "artist": "Chip Artist",
          "title": "Level One",
          "license": "CC BY-NC 4.0",
          "url": "https://freemusicarchive.org/music/..."
        }
      ]
    }
  ]
}

"file" must match the filename exactly, including capitals.
"artist" and "title" are shown scrolling on the FM display while the track
plays, which is how the attribution requirement gets met.
"license" and "url" are shown on the Music Credits screen in the pause menu.

Watch the commas: every item needs a comma after it except the last one in
its list. If the game says the music list could not be read, that is usually
a missing or extra comma.


3. PUBLISH
----------

Commit the files and tracks.json, push, and the deploy picks them up.

Keep the folder to a sensible size - a few dozen MP3s is fine, a few hundred
will make the site slow to load for everyone.


A NOTE ON WHAT NOT TO ADD
-------------------------

Commercial 80s recordings cannot go here. Streaming them, or committing them
to a public repository, is not something a licence covers. This folder is for
music whose licence permits it - which is why Free Music Archive and the
per-track licence check matter.
