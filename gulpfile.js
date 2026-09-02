/**
 * info-about 建置與部署
 *
 * 這份 gulpfile 於 2026-09 重寫，做法對齊 event-course-introduction，
 * 原因是舊版已經完全無法使用：
 *
 *   - 舊版用 gulp 3.9.1，在 Node 12 以上會拋 `primordials is not defined`
 *   - 部署靠 Travis CI（.travis.yml），該服務已停用；
 *     GitHub 上只剩 Dependabot 在跑，沒有任何部署 workflow
 *   - 憑證是 Travis 加密的 gcs.json.enc，本機解不開
 *
 * 結果是這個 repo 合併之後沒有任何機制能把改動送上線。
 *
 * .travis.yml 與 gcs.json.enc 已隨這次重寫一併刪除，留著只會讓人
 * 以為部署還有第三條路。舊版內容可用 git 歷史查閱。
 *
 * 現在改成與其他專案一致：gulp 5 + @google-cloud/storage，憑證直接用
 * repo 內的 tutor-test.json / tutor.json（與 tutor-sitemap、
 * event-course-introduction 等專案是同一組服務帳號）。
 *
 * 指令：
 *   npm run build           只建置，產出到 dist/
 *   npm run uploadGcsTest   建置後上傳測試機 www.tbbt.com.tw（自動加 noindex）
 *   npm run uploadGcsProd   建置後上傳正式機 www.ehanlin.com.tw
 *   npm run dev             監看檔案變動即時重建
 *
 * 產出結構與舊版完全相同：
 *   dist/infos/about/*.html
 *   dist/infos/about/<版本>/css|img|js|lib/
 *
 * ⚠️ 上傳只覆寫 dist/ 裡有的檔案，不會刪除 bucket 上的其他物件。
 *    tutor-infos 是共用 bucket，還有其他專案的內容在裡面。
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const gulp = require('gulp');
const pug = require('pug');
const less = require('less');
const { Storage } = require('@google-cloud/storage');

const pkg = require('./package.json');
const version = pkg.version;

const DIST_ROOT = 'dist';
const DIST_PATH = path.join(DIST_ROOT, 'infos', 'about');

/** src/pug 底下被 include 的 partial，不單獨產出 HTML */
const PARTIALS = new Set(['head.pug', 'html-head.pug', 'html-footer.pug']);

/* ---------- 環境設定 ---------- */

const gcsTestOptions = {
    projectId: 'tutor-test-238709',
    bucket: 'tutor-test-info',
    keyFilename: 'tutor-test.json',
    branch: 'test',
    cacheControl: 'no-store, no-transform'
};

const gcsProdOptions = {
    projectId: 'tutor-204108',
    bucket: 'tutor-infos',
    keyFilename: 'tutor.json',
    branch: 'master',
    cacheControl: 'no-store, no-transform'
};

/** pug 樣板變數，取自 package.json 的 branch 設定，與舊版 buildHtml 一致 */
function templateVars(branch) {
    const v = pkg.branch[branch];
    if (!v) throw new Error(`package.json 的 branch 沒有 ${branch}`);
    return {
        version,
        platformUrl: v.platformUrl,
        s3Path: v.s3Path,
        webcomponentVersion: v.webcomponentVersion
    };
}

/** 建置時採用哪一組樣板變數；上傳 task 會各自切換 */
let currentBranch = 'master';

/* ---------- 建置 ---------- */

async function clean() {
    await fsp.rm(DIST_ROOT, { recursive: true, force: true });
    await fsp.mkdir(DIST_PATH, { recursive: true });
}

async function copyDir(from, to) {
    if (!fs.existsSync(from)) return 0;
    await fsp.mkdir(to, { recursive: true });
    let n = 0;
    for (const e of await fsp.readdir(from, { withFileTypes: true })) {
        const s = path.join(from, e.name);
        const d = path.join(to, e.name);
        if (e.isDirectory()) n += await copyDir(s, d);
        else { await fsp.copyFile(s, d); n++; }
    }
    return n;
}

async function htmlTask() {
    const vars = templateVars(currentBranch);
    let n = 0;
    for (const f of await fsp.readdir('src/pug')) {
        if (!f.endsWith('.pug') || PARTIALS.has(f)) continue;
        const src = path.join('src/pug', f);
        const html = pug.renderFile(src, { filename: src, ...vars });
        await fsp.writeFile(path.join(DIST_PATH, f.replace(/\.pug$/, '.html')), html);
        n++;
    }
    console.log(`  html : ${n} 個（branch=${currentBranch}）`);
}

/** less 參數與舊版 buildStyle 一致，含 modifyVars.version */
async function styleTask() {
    if (!fs.existsSync('src/less')) return console.log('  css  : 0 個');
    const out = path.join(DIST_PATH, version, 'css');
    await fsp.mkdir(out, { recursive: true });
    let n = 0;
    for (const f of await fsp.readdir('src/less')) {
        if (!f.endsWith('.less')) continue;
        const src = path.join('src/less', f);
        const r = await less.render(await fsp.readFile(src, 'utf8'), {
            paths: [],
            filename: path.resolve(src),
            compress: false,
            modifyVars: { version: `"${version}"` }
        });
        await fsp.writeFile(path.join(out, f.replace(/\.less$/, '.css')), r.css);
        n++;
    }
    console.log(`  css  : ${n} 個`);
}

async function scriptTask() {
    if (!fs.existsSync('src/coffee')) return console.log('  js   : 0 個');
    const files = (await fsp.readdir('src/coffee')).filter((f) => f.endsWith('.coffee'));
    if (!files.length) return console.log('  js   : 0 個');
    const coffee = require('coffee-script');
    const out = path.join(DIST_PATH, version, 'js');
    await fsp.mkdir(out, { recursive: true });
    for (const f of files) {
        const js = coffee.compile(await fsp.readFile(path.join('src/coffee', f), 'utf8'));
        await fsp.writeFile(path.join(out, f.replace(/\.coffee$/, '.js')), js);
    }
    console.log(`  js   : ${files.length} 個`);
}

async function imgTask() {
    console.log(`  img  : ${await copyDir('src/img', path.join(DIST_PATH, version, 'img'))} 個`);
}

/** 把 dependencies 整包複製進 lib，與舊版 libTask 一致 */
async function libTask() {
    let n = 0;
    for (const m of Object.keys(pkg.dependencies || {})) {
        n += await copyDir(path.join('node_modules', m), path.join(DIST_PATH, version, 'lib', m));
    }
    console.log(`  lib  : ${n} 個`);
}

const build = gulp.series(clean, gulp.parallel(htmlTask, styleTask, scriptTask, imgTask, libTask));

/* ---------- 推測試機前的改寫 ---------- */

/**
 * --noindex：把 robots 改成 noindex,nofollow。
 *
 * 測試網址 www.tbbt.com.tw 是公開的，這兩頁又帶 Description 與 title，
 * 不擋會被搜尋引擎收錄成正式頁的重複內容。推測試機時一律加。
 * 做法與 event-course-introduction 一致。
 */
function hasFlag(flag) {
    return process.argv.includes(flag);
}

async function rewriteForTest() {
    if (!hasFlag('--noindex')) return;
    for (const file of await collectFiles(DIST_ROOT)) {
        if (!file.endsWith('.html')) continue;
        let html = await fsp.readFile(file, 'utf8');
        if (/<meta\s+name=["']robots["']/i.test(html)) {
            html = html.replace(/<meta\s+name=["']robots["'][^>]*>/i,
                '<meta name="robots" content="noindex,nofollow">');
        } else {
            html = html.replace(/<head>/i, '<head><meta name="robots" content="noindex,nofollow">');
        }
        await fsp.writeFile(file, html);
        console.log(`  noindex: ${path.relative(DIST_ROOT, file)}`);
    }
}

/* ---------- 上傳 ---------- */

async function collectFiles(dir, out = []) {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await collectFiles(p, out);
        else out.push(p);
    }
    return out;
}

function uploadToGCS(gcsOptions) {
    return async function upload() {
        const storage = new Storage({
            projectId: gcsOptions.projectId,
            keyFilename: gcsOptions.keyFilename
        });
        const files = await collectFiles(DIST_ROOT);
        console.log(`\n上傳 ${files.length} 個檔案 → gs://${gcsOptions.bucket}`);

        const CONCURRENCY = 5;
        for (let i = 0; i < files.length; i += CONCURRENCY) {
            await Promise.all(files.slice(i, i + CONCURRENCY).map(async (filePath) => {
                // destination 對應舊版 deployTask 的 file.relative，維持既有網址結構
                const destination = path.relative(DIST_ROOT, filePath).split(path.sep).join('/');
                await storage.bucket(gcsOptions.bucket).upload(filePath, {
                    destination,
                    metadata: { cacheControl: gcsOptions.cacheControl },
                    public: true
                });
                console.log(`  ${destination}`);
            }));
        }
        console.log(`完成：gs://${gcsOptions.bucket}`);
    };
}

/**
 * 上傳前把樣板變數切到對應環境。
 *
 * ⚠️ 這個專案的 package.json 裡 branch.test.platformUrl 被設成正式站網址，
 *    s3Path 兩邊也相同，webcomponentVersion 沒有任何樣板在用——
 *    所以 test 與 master 實際產出的 HTML 位元組完全相同（已實測）。
 *    保留這道切換是為了「改了設定就會生效」，不是因為目前有差異。詳見 README。
 */
function useBranch(branch) {
    return async function setBranch() { currentBranch = branch; };
}

/* ---------- dev ---------- */

function dev() {
    gulp.watch(['src/pug/**/*.pug', 'src/less/**/*.less', 'src/img/**/*'], build);
    console.log('監看 src/ 變動中，Ctrl+C 結束');
}

/* ---------- 對外指令 ---------- */

exports.clean = clean;
exports.build = build;
exports.dev = gulp.series(build, dev);
exports.uploadGcsTest = gulp.series(useBranch(gcsTestOptions.branch), build, rewriteForTest, uploadToGCS(gcsTestOptions));
exports.uploadGcsProd = gulp.series(useBranch(gcsProdOptions.branch), build, uploadToGCS(gcsProdOptions));
exports.default = build;
