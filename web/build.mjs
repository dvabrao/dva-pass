// Gera um único index.html (usado no PC e dentro do APK)
import * as esbuild from 'esbuild'; import fs from 'fs';
const gradle = fs.readFileSync('../app/build.gradle', 'utf8');
const version = (gradle.match(/versionName '([^']+)'/) || [])[1] || 'dev';
const r = await esbuild.build({ entryPoints: ['src/app.js'], bundle: true, format: 'iife', minify: true, write: false, target: ['chrome80'], define: { __APP_VERSION__: JSON.stringify(version) }, legalComments: 'none', alias: { crypto: './shim/empty.js' } });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = (await esbuild.transform(fs.readFileSync('src/style.css', 'utf8'), { loader: 'css', minify: true })).code;
const html = fs.readFileSync('src/index.html', 'utf8').replace('/*CSS*/', () => css).replace('/*JS*/', () => js);
fs.mkdirSync('../app/src/main/assets', { recursive: true });
fs.writeFileSync('../app/src/main/assets/index.html', html);
console.log('DVA_Pass', version, (html.length / 1024).toFixed(0) + ' KB');
