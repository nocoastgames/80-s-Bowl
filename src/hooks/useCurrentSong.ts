import { useState, useEffect } from 'react';
import { RADIO_STATIONS } from '../lib/audio';

export function useCurrentSong(stationIndex: number) {
  const [songText, setSongText] = useState('Loading...');

  useEffect(() => {
    if (stationIndex === -1 || !RADIO_STATIONS[stationIndex]) {
      setSongText('RADIO OFF');
      return;
    }

    const station = RADIO_STATIONS[stationIndex];
    let isMounted = true;
    let timeoutId: number;

    const fetchSong = async () => {
      try {
        // SomaFM API does not have CORS headers by default for some endpoints, 
        // but let's try direct fetch. If it fails, fallback to station name.
        const res = await fetch(`https://somafm.com/songs/${station.id}.json`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        if (isMounted && data?.songs?.length > 0) {
           const song = data.songs[0];
           setSongText(`${song.artist} - ${song.title}`);
        } else if (isMounted) {
            setSongText(`${station.name}`);
        }
      } catch (err) {
        if (isMounted) setSongText(`${station.name} Live`);
      }

      if (isMounted) {
         timeoutId = window.setTimeout(fetchSong, 20000); // Check every 20s
      }
    };

    setSongText('Loading...');
    fetchSong();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [stationIndex]);

  return songText;
}
