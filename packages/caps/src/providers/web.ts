import { defineProvider } from "../sdk";

/** Six vendors: Flickr and SoundCloud restrict commercial use, YouTube, Vimeo, TikTok and Spotify state nothing on oEmbed. The most restrictive verdict stands, so unknown. */
export const oembedVendors = defineProvider({
  name: "Media sites (oEmbed)",
  url: "https://oembed.com",
  termsUrl:
    "https://developers.google.com/youtube/terms/api-services-terms-of-service",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    // Developer Terms IV: "do not transfer Spotify Content to third parties".
    "open.spotify.com": "forbidden",
    // Terms of use: no "transfer, share, distribute or otherwise use or exploit any Content".
    "soundcloud.com": "forbidden",
    "vimeo.com": "unknown",
    // The API terms limit caching photos; an oEmbed reply holds only text and a thumbnail URL.
    "www.flickr.com": "unknown",
    "www.tiktok.com": "unknown",
    // youtube.com/t/terms: not to "access, reproduce, download, distribute, transmit ... any part of
    // the Service or any Content" except as expressly authorized or with written permission.
    "www.youtube.com": "forbidden",
  },
});
