package br.dva.dvapass;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.fingerprint.FingerprintManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.provider.OpenableColumns;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * DVA_Pass — cofre de senhas compatível com KeePass.
 * Criado por Daniel Vale Abrão (dvabrao@gmail.com)
 *
 * O app não tem permissão de internet: as senhas nunca saem do aparelho,
 * a não ser pelo próprio arquivo .kdbx (criptografado) que você escolhe no Google Drive.
 */
public class MainActivity extends Activity {
    private static final String HOST = "https://dvapass.local/";
    private static final String KEY_ALIAS = "dvapass_bio";
    private static final int REQ_OPEN_DB = 11, REQ_OPEN_KEY = 12, REQ_CREATE = 13, REQ_SAVE_AS = 14, REQ_CHOOSER = 15;
    private ValueCallback<Uri[]> chooserCb;

    private WebView web;
    private long lastBack = 0;
    private String pendingId = null;
    private String pendingData = null;
    private boolean externalUi = false; // seletor de arquivo / digital abertos
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Runnable clipClear;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_SECURE); // sem print e sem miniatura nos apps recentes
        w.setStatusBarColor(0xFF0F1218);
        w.setNavigationBarColor(0xFF0A0C10);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0A0C10);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setSaveFormData(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.startsWith(HOST)) {
                    try {
                        String path = u.substring(HOST.length());
                        int q = path.indexOf('?'); if (q >= 0) path = path.substring(0, q);
                        if (path.isEmpty()) path = "index.html";
                        String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".js") ? "application/javascript" : "application/octet-stream";
                        return new WebResourceResponse(mime, "utf-8", getAssets().open(path));
                    } catch (Exception e) { return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null); }
                }
                // nada é carregado da internet
                return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", null, null);
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                openExternal(r.getUrl().toString()); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // seletor de imagem (logomarca e ícones de pasta)
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (chooserCb != null) chooserCb.onReceiveValue(null);
                chooserCb = cb; externalUi = true;
                try { startActivityForResult(params.createIntent(), REQ_CHOOSER); }
                catch (Exception e) { chooserCb = null; externalUi = false; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        setContentView(web);
        web.loadUrl(HOST + "index.html");
    }

    // ---------------- retorno para o JavaScript ----------------
    private void reply(String id, boolean ok, String data) {
        final String js = "window.DVA_cb(" + JSONObject.quote(id) + "," + ok + "," + (data == null ? "null" : JSONObject.quote(data)) + ")";
        ui.post(() -> web.evaluateJavascript(js, null));
    }

    private String nameOf(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        String p = uri.getLastPathSegment(); return p == null ? "cofre.kdbx" : p;
    }

    private void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (Exception e) { ui.post(() -> Toast.makeText(this, "Nenhum app para abrir o endereço", Toast.LENGTH_SHORT).show()); }
    }

    private static String hashKey(String k) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(k.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(h, Base64.NO_WRAP | Base64.URL_SAFE);
        } catch (Exception e) { return k; }
    }

    private void writeBytes(Uri uri, byte[] data) throws Exception {
        OutputStream os = null;
        for (String mode : new String[]{"wt", "rwt", "w"}) {
            try { os = getContentResolver().openOutputStream(uri, mode); if (os != null) break; } catch (Exception ignored) {}
        }
        if (os == null) throw new Exception("Sem permissão para gravar no arquivo");
        try { os.write(data); os.flush(); } finally { os.close(); }
    }

    // ---------------- ponte ----------------
    class Bridge {
        @JavascriptInterface
        public void pickFile(String id, String mode) {
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                        | ("db".equals(mode) ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0));
                pendingId = id; externalUi = true;
                try { startActivityForResult(i, "db".equals(mode) ? REQ_OPEN_DB : REQ_OPEN_KEY); }
                catch (Exception e) { externalUi = false; reply(id, false, "Não foi possível abrir o seletor de arquivos"); }
            });
        }

        @JavascriptInterface
        public void createFile(String id, String name) { create(id, name, null, REQ_CREATE); }

        @JavascriptInterface
        public void saveAs(String id, String name, String b64) { create(id, name, b64, REQ_SAVE_AS); }

        private void create(String id, String name, String b64, int req) {
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/octet-stream");
                i.putExtra(Intent.EXTRA_TITLE, name);
                pendingId = id; pendingData = b64; externalUi = true;
                try { startActivityForResult(i, req); }
                catch (Exception e) { externalUi = false; reply(id, false, "Não foi possível criar o arquivo"); }
            });
        }

        @JavascriptInterface
        public void readFile(String id, String uri) {
            io.execute(() -> {
                try (InputStream is = getContentResolver().openInputStream(Uri.parse(uri))) {
                    if (is == null) throw new Exception("Arquivo indisponível");
                    ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[65536]; int n;
                    while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                    reply(id, true, Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                } catch (SecurityException e) {
                    reply(id, false, "Sem acesso ao arquivo. Abra-o novamente pela tela inicial.");
                } catch (Exception e) {
                    reply(id, false, "Não foi possível ler o arquivo: " + e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void writeFile(String id, String uri, String b64) {
            io.execute(() -> {
                try { writeBytes(Uri.parse(uri), Base64.decode(b64, Base64.NO_WRAP)); reply(id, true, "ok"); }
                catch (Exception e) { reply(id, false, "Não foi possível gravar: " + e.getMessage()); }
            });
        }

        @JavascriptInterface
        public void releaseUri(String uri) {
            try { getContentResolver().releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void copy(String text, int clearSec) {
            ui.post(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText("DVA_Pass", text);
                PersistableBundle extras = new PersistableBundle();
                extras.putBoolean(Build.VERSION.SDK_INT >= 33 ? ClipDescription.EXTRA_IS_SENSITIVE : "android.content.extra.IS_SENSITIVE", true);
                clip.getDescription().setExtras(extras);
                cm.setPrimaryClip(clip);
                if (clipClear != null) ui.removeCallbacks(clipClear);
                if (clearSec > 0) {
                    clipClear = () -> { try { cm.clearPrimaryClip(); } catch (Exception ignored) {} };
                    ui.postDelayed(clipClear, clearSec * 1000L);
                }
            });
        }

        @JavascriptInterface
        public void openUrl(String url) { openExternal(url); }

        @JavascriptInterface
        public void exitApp() { ui.post(MainActivity.this::finish); }

        // ----- digital -----
        @JavascriptInterface
        public String bioStatus() {
            try {
                if (Build.VERSION.SDK_INT >= 30) {
                    int r = getSystemService(BiometricManager.class).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
                    return r == BiometricManager.BIOMETRIC_SUCCESS ? "ok" : r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ? "none" : "unsupported";
                } else if (Build.VERSION.SDK_INT == 29) {
                    int r = getSystemService(BiometricManager.class).canAuthenticate();
                    return r == BiometricManager.BIOMETRIC_SUCCESS ? "ok" : r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ? "none" : "unsupported";
                } else {
                    @SuppressWarnings("deprecation") FingerprintManager fm = (FingerprintManager) getSystemService(Context.FINGERPRINT_SERVICE);
                    if (fm == null || !fm.isHardwareDetected()) return "unsupported";
                    return fm.hasEnrolledFingerprints() ? "ok" : "none";
                }
            } catch (Exception e) { return "unsupported"; }
        }

        @JavascriptInterface
        public boolean bioHas(String key) { return prefs().contains(hashKey(key)); }

        @JavascriptInterface
        public void bioRemove(String key) { prefs().edit().remove(hashKey(key)).apply(); }

        @JavascriptInterface
        public void bioEncrypt(String id, String key, String secret) {
            ui.post(() -> {
                try {
                    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                    try { c.init(Cipher.ENCRYPT_MODE, bioKey(false)); }
                    catch (KeyPermanentlyInvalidatedException e) { c.init(Cipher.ENCRYPT_MODE, bioKey(true)); }
                    prompt("Ativar digital", "Confirme com a sua digital", c, id, (cipher) -> {
                        byte[] ct = cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));
                        String v = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
                        prefs().edit().putString(hashKey(key), v).apply();
                        return "ok";
                    });
                } catch (Exception e) { reply(id, false, "erro"); }
            });
        }

        @JavascriptInterface
        public void bioDecrypt(String id, String key) {
            ui.post(() -> {
                String v = prefs().getString(hashKey(key), null);
                if (v == null) { reply(id, false, "none"); return; }
                try {
                    String[] p = v.split(":");
                    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                    c.init(Cipher.DECRYPT_MODE, bioKey(false), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
                    final byte[] ct = Base64.decode(p[1], Base64.NO_WRAP);
                    prompt("Abrir DVA_Pass", "Use a sua digital para desbloquear o cofre", c, id,
                            (cipher) -> new String(cipher.doFinal(ct), StandardCharsets.UTF_8));
                } catch (KeyPermanentlyInvalidatedException e) {
                    prefs().edit().clear().apply();
                    try { KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); ks.deleteEntry(KEY_ALIAS); } catch (Exception ignored) {}
                    reply(id, false, "invalidated");
                } catch (Exception e) { reply(id, false, "erro"); }
            });
        }
    }

    interface CipherJob { String run(Cipher c) throws Exception; }

    private SharedPreferences prefs() { return getSharedPreferences("bio", MODE_PRIVATE); }

    private SecretKey bioKey(boolean recreate) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (recreate) { ks.deleteEntry(KEY_ALIAS); prefs().edit().clear().apply(); }
        if (!ks.containsAlias(KEY_ALIAS)) {
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setUserAuthenticationRequired(true)
                    .setInvalidatedByBiometricEnrollment(true)
                    .build());
            kg.generateKey();
        }
        return (SecretKey) ks.getKey(KEY_ALIAS, null);
    }

    private void prompt(String title, String sub, Cipher cipher, String id, CipherJob job) {
        Executor ex = getMainExecutor();
        BiometricPrompt bp = new BiometricPrompt.Builder(this)
                .setTitle(title).setSubtitle(sub)
                .setNegativeButton("Usar senha", ex, (d, w) -> { externalUi = false; reply(id, false, "cancel"); })
                .build();
        externalUi = true;
        bp.authenticate(new BiometricPrompt.CryptoObject(cipher), new CancellationSignal(), ex, new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                externalUi = false;
                try { reply(id, true, job.run(r.getCryptoObject().getCipher())); } catch (Exception e) { reply(id, false, "erro"); }
            }
            @Override public void onAuthenticationError(int code, CharSequence msg) { externalUi = false; reply(id, false, "cancel"); }
        });
    }

    // ---------------- resultados dos seletores ----------------
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        externalUi = false;
        if (req == REQ_CHOOSER) {
            if (chooserCb != null) chooserCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            chooserCb = null; return;
        }
        String id = pendingId; pendingId = null;
        String payload = pendingData; pendingData = null;
        if (id == null) return;
        if (res != RESULT_OK || data == null || data.getData() == null) { reply(id, false, "cancelado"); return; }
        Uri uri = data.getData();
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | (req == REQ_OPEN_KEY ? 0 : Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try { getContentResolver().takePersistableUriPermission(uri, flags); }
        catch (Exception e) { try { getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) {} }
        if (req == REQ_SAVE_AS) {
            io.execute(() -> {
                try { writeBytes(uri, Base64.decode(payload, Base64.NO_WRAP)); reply(id, true, "ok"); }
                catch (Exception e) { reply(id, false, "Não foi possível gravar: " + e.getMessage()); }
            });
            return;
        }
        try {
            JSONObject o = new JSONObject();
            o.put("uri", uri.toString()); o.put("name", nameOf(uri));
            reply(id, true, o.toString());
        } catch (Exception e) { reply(id, false, "erro"); }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (!externalUi && web != null) web.evaluateJavascript("window.DVA_pause&&window.DVA_pause()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.DVA_back&&window.DVA_back()", r -> {
            if ("true".equals(r)) return;
            long now = System.currentTimeMillis();
            if (now - lastBack < 2000) { finish(); return; }
            lastBack = now;
            Toast.makeText(this, "Toque em voltar de novo para sair", Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        io.shutdown();
        super.onDestroy();
    }
}
