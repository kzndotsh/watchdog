import { defineProvider } from "../sdk";

/** Six vendors: Flickr and SoundCloud restrict commercial use, YouTube, Vimeo, TikTok and Spotify state nothing on oEmbed. The most restrictive verdict stands, so unknown. */
export const oembedVendors = defineProvider({
  name: "Vendor oEmbed endpoints (YouTube, Vimeo, Flickr, SoundCloud, TikTok, Spotify)",
  url: "https://oembed.com",
  termsUrl:
    "https://developers.google.com/youtube/terms/api-services-terms-of-service",
  tier: "free",
  commercialUse: "unknown",
});
