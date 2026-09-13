import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { execSync } from "node:child_process";

const url = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.2151.40";
const outZip = path.join(process.cwd(), "webview2.zip");
const outDir = path.join(process.cwd(), "webview2-sdk");

if (fs.existsSync(outDir)) {
    console.log("WebView2 already downloaded.");
    process.exit(0);
}

console.log("Downloading WebView2...");
const file = fs.createWriteStream(outZip);

const handleExtract = () => {
    file.close(() => {
        console.log("Extracting...");
        try {
            execSync(`powershell -Command "Expand-Archive -Path '${outZip}' -DestinationPath '${outDir}' -Force"`);
        } catch(e) {}
        fs.unlinkSync(outZip);
        console.log("Done.");
    });
};

https.get(url, (res) => {
    if (res.statusCode === 302) {
        https.get(res.headers.location, (res2) => {
            res2.pipe(file);
            file.on("finish", handleExtract);
        });
    } else {
        res.pipe(file);
        file.on("finish", handleExtract);
    }
});
