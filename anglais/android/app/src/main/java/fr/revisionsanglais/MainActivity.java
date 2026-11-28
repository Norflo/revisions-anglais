package fr.revisionsanglais;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Appli « Révisions d'anglais ».
 *
 * La page et les sons sont dans l'APK (marche hors connexion dès le premier lancement).
 * Quand il y a Internet, l'appli va chercher la dernière version de la page et les sons des
 * nouveaux mots sur GitHub (dossier anglais/site du dépôt) et les garde sur le téléphone :
 * les nouveaux mots arrivent sans réinstaller l'APK.
 */
public class MainActivity extends Activity {

    /** Adresse interne de l'appli (fixe : les progrès enregistrés restent attachés à elle). */
    static final String HOST = "revisions-anglais.app";
    static final String HOME = "https://" + HOST + "/index.html";
    /** Source en ligne des fichiers. */
    static final String REPO = "Norflo/revisions-anglais";
    static final String REMOTE_MAIN =
        "https://raw.githubusercontent.com/" + REPO + "/main/anglais/site/";

    // GitHub garde jusqu'à 5 minutes une ancienne copie des fichiers de « main ».
    // L'appli demande donc d'abord le numéro du dernier commit (API GitHub, toujours à jour) puis
    // télécharge les fichiers de ce commit précis : jamais d'ancienne copie.
    // Numéro redemandé au plus toutes les 20 s (l'API autorise 60 demandes par heure sans compte).
    private static volatile String headSha = null;
    private static long shaAt = 0;

    private static synchronized void refreshSha() {
        long now = System.currentTimeMillis();
        if (now - shaAt < 20000) return;
        shaAt = now;
        byte[] d = download("https://api.github.com/repos/" + REPO + "/commits/main", 2500,
                            "application/vnd.github.sha");
        if (d == null) return;   // pas d'Internet ou limite atteinte : on garde le précédent
        String v = new String(d, StandardCharsets.UTF_8).trim();
        if (v.matches("[0-9a-f]{40}")) headSha = v;
    }

    private static String remote() {
        refreshSha();
        String s = headSha;
        return s == null ? REMOTE_MAIN
                         : "https://raw.githubusercontent.com/" + REPO + "/" + s + "/anglais/site/";
    }

    private WebView web;
    private File cacheDir;
    /** Sons fabriqués par la voix du téléphone pour les mots ajoutés dans l'appli. */
    private File localDir;
    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        cacheDir = new File(getFilesDir(), "site");
        localDir = new File(getFilesDir(), "local");
        initTts();
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0xE9, 0xED, 0xFA));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // progrès (localStorage)
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "AndroidApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equalsIgnoreCase(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!HOST.equalsIgnoreCase(u.getHost())) return null;   // polices Google, etc.
                return serve(u);
            }
        });

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(HOME);
        }
    }

    // ------------------------------------------------------------------------------------
    // Fichiers de l'appli : page = en ligne d'abord ; sons = copie gardée d'abord.
    // ------------------------------------------------------------------------------------

    private WebResourceResponse serve(Uri u) {
        String path = u.getPath() == null ? "" : u.getPath().replaceFirst("^/+", "");
        if (path.isEmpty()) path = "index.html";
        if (path.contains("..")) return notFound();
        String query = u.getQuery();
        // La clé de cache tient compte de « ?v=… » : un son refait change de version.
        String key = path + (query == null ? "" : "__" + query.replaceAll("[^A-Za-z0-9=._-]", "_"));
        File cached = new File(cacheDir, key);
        boolean page = path.endsWith(".html");
        // Page, scripts et données : version en ligne d'abord (mises à jour), copie gardée sinon.
        boolean fresh = page || path.endsWith(".js") || path.endsWith(".json") || path.endsWith(".css");

        byte[] data = null;
        if (fresh) {
            data = download(remote() + path, 4000);
            if (data != null) save(cached, data);
            else data = read(cached);
        } else {
            data = read(cached);
            if (data == null && path.startsWith("audio/")) {
                byte[] local = read(localAudio(path.substring(6).replaceFirst("\\.mp3$", "")));
                if (local != null && asset(path) == null) return response("audio/wav", local);
            }
            if (data == null) {
                data = download(remote() + path, 8000);
                if (data != null) save(cached, data);
            }
        }
        if (data == null) data = asset(path);
        if (data == null && path.startsWith("audio/")) {
            File local = localAudio(path.substring(6).replaceFirst("\\.mp3$", ""));
            data = read(local);
            if (data != null) return response("audio/wav", data);
        }
        if (data == null) return notFound();
        if (page) data = injectScript(data);
        return response(mime(path), data);
    }

    /** Ajoute l'onglet « Ajouter » (ajout.js) à la page. */
    private static byte[] injectScript(byte[] html) {
        String s = new String(html, StandardCharsets.UTF_8);
        if (s.contains("ajout.js")) return html;
        int k = s.lastIndexOf("</body>");
        if (k < 0) return html;
        s = s.substring(0, k) + "<script src=\"ajout.js\"></script>\n" + s.substring(k);
        return s.getBytes(StandardCharsets.UTF_8);
    }

    private File localAudio(String slug) {
        return new File(localDir, slug.replaceAll("[^a-z0-9-]", "") + ".wav");
    }

    // ------------------------------------------------------------------------------------
    // Voix du téléphone (anglais américain, voix féminine si possible)
    // ------------------------------------------------------------------------------------

    static final String GOOGLE_TTS = "com.google.android.tts";
    private String voiceName = "";
    private String engineName = "";

    /** Voix Google du téléphone si elle est installée (meilleure qualité), sinon voix par défaut. */
    private void initTts() {
        startTts(GOOGLE_TTS);
    }

    private void startTts(String engine) {
        final boolean google = GOOGLE_TTS.equals(engine);
        TextToSpeech.OnInitListener l = status -> {
            if (status != TextToSpeech.SUCCESS) {
                if (google) { try { tts.shutdown(); } catch (Exception ignored) { } startTts(null); }
                return;
            }
            engineName = google ? "Google" : String.valueOf(tts.getDefaultEngine());
            tts.setLanguage(Locale.US);
            tts.setSpeechRate(0.92f);
            pickVoice();
            ttsReady = true;
        };
        tts = engine == null ? new TextToSpeech(getApplicationContext(), l)
                             : new TextToSpeech(getApplicationContext(), l, engine);
    }

    /**
     * Choisit la voix anglaise américaine la plus naturelle : féminine, haute qualité,
     * de préférence la version « en ligne » de Google (plus naturelle) quand Internet est là.
     */
    private void pickVoice() {
        try {
            boolean online = isOnline();
            Voice best = null; int bestScore = Integer.MIN_VALUE;
            for (Voice v : tts.getVoices()) {
                Locale loc = v.getLocale();
                if (loc == null || !"en".equals(loc.getLanguage()) || !"US".equals(loc.getCountry())) continue;
                if (v.getFeatures() != null && v.getFeatures().contains("notInstalled")) continue;
                if (v.isNetworkConnectionRequired() && !online) continue;
                String n = v.getName().toLowerCase(Locale.ROOT);
                int score = v.getQuality() / 10;                         // 50 = très haute qualité
                if (n.matches(".*-(tpf|sfg|tpc|iob|iog)-.*") || n.contains("female")) score += 100;
                if (n.matches(".*-(iol|iom|tpd)-.*") || n.contains("male") && !n.contains("female")) score -= 100;
                if (v.isNetworkConnectionRequired() || n.endsWith("-network")) score += 30;
                if (score > bestScore) { bestScore = score; best = v; }
            }
            if (best != null) { tts.setVoice(best); voiceName = best.getName(); }
        } catch (Exception ignored) { }
    }

    private boolean isOnline() {
        try {
            android.net.ConnectivityManager cm =
                (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            android.net.NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
            return nc != null && nc.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) { return false; }
    }

    // ------------------------------------------------------------------------------------
    // Traduction (MyMemory, gratuit, sans compte)
    // ------------------------------------------------------------------------------------

    static String translate(String word) {
        List<String> alts = new ArrayList<>();
        try {
            String url = "https://api.mymemory.translated.net/get?langpair=en%7Cfr&q="
                + URLEncoder.encode(word, "UTF-8");
            byte[] d = download(url, 8000);
            if (d != null) {
                JSONObject j = new JSONObject(new String(d, StandardCharsets.UTF_8));
                JSONObject rd = j.optJSONObject("responseData");
                if (rd != null) addAlt(alts, rd.optString("translatedText"), word);
                JSONArray m = j.optJSONArray("matches");
                if (m != null) {
                    for (int i = 0; i < m.length() && alts.size() < 6; i++) {
                        JSONObject o = m.optJSONObject(i);
                        if (o != null) addAlt(alts, o.optString("translation"), word);
                    }
                }
            }
        } catch (Exception ignored) { }
        JSONObject out = new JSONObject();
        try { out.put("alts", new JSONArray(alts)); } catch (Exception ignored) { }
        return out.toString();
    }

    private static void addAlt(List<String> alts, String t, String word) {
        if (t == null) return;
        t = t.trim().replaceAll("\\s+", " ");
        if (t.isEmpty() || t.length() > 80) return;
        if (t.toUpperCase(Locale.ROOT).equals(t) && t.length() > 3) t = t.toLowerCase(Locale.FRENCH);
        if (t.equalsIgnoreCase(word)) return;
        for (String a : alts) if (a.equalsIgnoreCase(t)) return;
        alts.add(t);
    }

    /** Fonctions appelées par la page (ajout.js). */
    class Bridge {
        @JavascriptInterface
        public void translate(final int id, final String word) {
            new Thread(() -> {
                final String res = MainActivity.translate(word);
                runOnUiThread(() -> web.evaluateJavascript(
                    "window.__ajoutTr && window.__ajoutTr(" + id + "," + JSONObject.quote(res) + ")", null));
            }).start();
        }

        @JavascriptInterface
        public void speak(String text) {
            if (tts != null && ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "say");
        }

        /** Voix du téléphone à une autre vitesse (dictée lente : rate 0.55). */
        @JavascriptInterface
        public void speakRate(String text, float rate) {
            if (tts == null || !ttsReady) return;
            tts.setSpeechRate(Math.max(0.3f, Math.min(1.5f, rate)));
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "say-rate");
            tts.setSpeechRate(0.92f);
        }

        /** Voix utilisée (pour l'afficher et refaire les sons si elle change). */
        @JavascriptInterface
        public String voiceInfo() {
            if (!ttsReady) return "";
            return engineName + "|" + voiceName;
        }

        @JavascriptInterface
        public void synth(String text, String slug) {
            if (tts == null || !ttsReady) return;
            pickVoice();
            localDir.mkdirs();
            tts.synthesizeToFile(text, new Bundle(), localAudio(slug), "file-" + slug);
        }

        @JavascriptInterface
        public void dropLocal(String slug) {
            //noinspection ResultOfMethodCallIgnored
            localAudio(slug).delete();
        }

        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                try { startActivity(Intent.createChooser(i, "Envoyer la liste")); } catch (Exception ignored) { }
            });
        }
    }

    private static byte[] download(String url, int timeoutMs) { return download(url, timeoutMs, null); }

    private static byte[] download(String url, int timeoutMs, String accept) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs);
            c.setUseCaches(false);
            c.setRequestProperty("User-Agent", "revisions-anglais-app");
            if (accept != null) c.setRequestProperty("Accept", accept);
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream()) {
                byte[] d = readAll(in);
                return d.length > 0 ? d : null;
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static void save(File f, byte[] data) {
        try {
            File dir = f.getParentFile();
            if (dir != null) dir.mkdirs();
            File tmp = new File(f.getPath() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(data); }
            if (!tmp.renameTo(f)) tmp.delete();
        } catch (Exception ignored) { }
    }

    private static byte[] read(File f) {
        try { return f.isFile() ? Files.readAllBytes(f.toPath()) : null; }
        catch (Exception e) { return null; }
    }

    private byte[] asset(String path) {
        try (InputStream in = getAssets().open(path)) { return readAll(in); }
        catch (Exception e) { return null; }
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".mp3")) return "audio/mpeg";
        if (path.endsWith(".wav")) return "audio/wav";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private static WebResourceResponse response(String mime, byte[] data) {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        h.put("Access-Control-Allow-Origin", "*");
        String enc = mime.startsWith("text/") || mime.equals("application/json") ? "utf-8" : null;
        return new WebResourceResponse(mime, enc, 200, "OK", h, new ByteArrayInputStream(data));
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
            new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    // ------------------------------------------------------------------------------------

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        // Geste ou bouton « retour » : la page revient à l'écran précédent (window.appBack()).
        // Elle répond false seulement sur l'accueil : l'appli se ferme alors normalement.
        web.evaluateJavascript("(function(){try{return !!(window.appBack&&window.appBack());}catch(e){return false;}})()", r -> {
            if (!"true".equals(r)) super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
