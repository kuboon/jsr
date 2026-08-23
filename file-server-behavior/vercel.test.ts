import { assertEquals } from "@std/assert";
import { FileServerBehavior, type VercelOptions } from "./vercel.ts";
import {
  FIXTURE_FILES,
  type Resolution,
  resolve,
} from "./_resolve_test_util.ts";

function serve(path: string): Resolution {
  return { type: "serve", path };
}
function redirect(target: string): Resolution {
  return { type: "redirect", target };
}
const notFound: Resolution = { type: "404" };

const urls = [
  "/file",
  "/file/",
  "/file.html",
  "/folder",
  "/folder/",
  "/folder/index.html",
  "/both",
  "/both/",
  "/both.html",
  "/both/index.html",
];

function check(name: string, options: VercelOptions, expected: Resolution[]) {
  Deno.test(`Vercel ${name} matches the trailing-slash-guide table`, () => {
    const behavior = new FileServerBehavior(options);
    urls.forEach((url_path, i) => {
      assertEquals(
        resolve(behavior, url_path, FIXTURE_FILES),
        expected[i],
        url_path,
      );
    });
  });
}

check(
  "cleanUrls=false trailingSlash=undefined",
  { cleanUrls: false, trailingSlash: undefined },
  [
    notFound,
    notFound,
    serve("/file.html"),
    serve("/folder/index.html"),
    serve("/folder/index.html"),
    serve("/folder/index.html"),
    serve("/both/index.html"),
    serve("/both/index.html"),
    serve("/both.html"),
    serve("/both/index.html"),
  ],
);

check(
  "cleanUrls=false trailingSlash=false",
  { cleanUrls: false, trailingSlash: false },
  [
    notFound,
    notFound,
    serve("/file.html"),
    serve("/folder/index.html"),
    redirect("/folder"),
    serve("/folder/index.html"),
    serve("/both/index.html"),
    redirect("/both"),
    serve("/both.html"),
    serve("/both/index.html"),
  ],
);

check(
  "cleanUrls=false trailingSlash=true",
  { cleanUrls: false, trailingSlash: true },
  [
    notFound,
    notFound,
    serve("/file.html"),
    redirect("/folder/"),
    serve("/folder/index.html"),
    serve("/folder/index.html"),
    redirect("/both/"),
    serve("/both/index.html"),
    serve("/both.html"),
    serve("/both/index.html"),
  ],
);

check(
  "cleanUrls=true trailingSlash=undefined",
  { cleanUrls: true, trailingSlash: undefined },
  [
    serve("/file.html"),
    serve("/file.html"),
    redirect("/file"),
    serve("/folder/index.html"),
    serve("/folder/index.html"),
    redirect("/folder"),
    serve("/both.html"),
    serve("/both.html"),
    redirect("/both"),
    redirect("/both"),
  ],
);

check(
  "cleanUrls=true trailingSlash=false",
  { cleanUrls: true, trailingSlash: false },
  [
    serve("/file.html"),
    redirect("/file"),
    redirect("/file"),
    serve("/folder/index.html"),
    redirect("/folder"),
    redirect("/folder"),
    serve("/both.html"),
    redirect("/both"),
    redirect("/both"),
    redirect("/both"),
  ],
);

check(
  "cleanUrls=true trailingSlash=true",
  { cleanUrls: true, trailingSlash: true },
  [
    redirect("/file/"),
    serve("/file.html"),
    redirect("/file/"),
    redirect("/folder/"),
    serve("/folder/index.html"),
    redirect("/folder/"),
    redirect("/both/"),
    serve("/both.html"),
    redirect("/both/"),
    redirect("/both/"),
  ],
);
