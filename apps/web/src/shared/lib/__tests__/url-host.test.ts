import { describe, expect, it } from "vitest";

import { urlHost } from "@/shared/lib/url-host";

describe("urlHost", () => {
  it("returns the hostname without www", () => {
    expect(urlHost("https://www.shodan.io/terms?x=1")).toBe("shodan.io");
    expect(urlHost("https://api.example.com/a")).toBe("api.example.com");
  });

  it("returns the input when it is not a URL", () => {
    expect(urlHost("not a url")).toBe("not a url");
  });
});
