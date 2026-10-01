package app.slate.workspace;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "SlateVault")
public class SlateVaultPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean picking = false;
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private android.content.SharedPreferences roots() { return getContext().getSharedPreferences("slate-vaults", 0); }

    @PluginMethod public synchronized void open(PluginCall call) {
        if (picking) { call.reject("Finish choosing the current folder first."); return; }
        picking = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        try { startActivityForResult(call, intent, "folderResult"); }
        catch (Exception error) { picking = false; call.reject("The folder picker could not open.", error); }
    }
    @ActivityCallback private void folderResult(PluginCall call, ActivityResult result) {
        picking = false; if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); return;
        }
        try {
            Uri tree = result.getData().getData();
            int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if ((flags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == 0) throw new IllegalStateException("Choose a writable local folder.");
            getContext().getContentResolver().takePersistableUriPermission(tree, flags);
            String id = UUID.nameUUIDFromBytes(tree.toString().getBytes(StandardCharsets.UTF_8)).toString();
            roots().edit().putString(id, tree.toString()).apply();
            Uri document = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            JSObject response = new JSObject(); response.put("id", id); response.put("name", displayName(document)); call.resolve(response);
        } catch (Exception error) { call.reject("Allow read and write access to this folder and try again.", error); }
    }
    private Uri tree(String id) {
        String value = roots().getString(id, null);
        if (value == null) throw new IllegalArgumentException("Reopen this vault to allow folder access.");
        return Uri.parse(value);
    }
    private String[] path(String value) {
        if (value == null || value.isEmpty() || value.contains("\\") || value.contains("\0") || value.contains(":")) throw new IllegalArgumentException("Invalid vault path.");
        String[] parts = value.split("/", -1);
        for (String part : parts) if (part.isEmpty() || part.equals(".") || part.equals("..")) throw new IllegalArgumentException("Invalid vault path.");
        return parts;
    }
    private String displayName(Uri document) throws Exception {
        try (Cursor cursor = getContext().getContentResolver().query(document, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("Folder unavailable."); return cursor.getString(0);
        }
    }
    private static class Child {
        final Uri uri; final String name; final boolean directory;
        Child(Uri uri, String name, boolean directory) { this.uri = uri; this.name = name; this.directory = directory; }
    }
    private ArrayList<Child> children(Uri tree, Uri parent) throws Exception {
        ArrayList<Child> values = new ArrayList<>();
        Uri query = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(parent));
        try (Cursor cursor = getContext().getContentResolver().query(query, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
            if (cursor == null) throw new IllegalStateException("Folder unavailable.");
            while (cursor.moveToNext()) {
                String name = cursor.getString(1); path(name);
                values.add(new Child(DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0)), name, DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(2))));
            }
        }
        return values;
    }
    private Uri find(Uri tree, String relative, boolean createParents) throws Exception {
        String[] parts = path(relative);
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        for (int i = 0; i < parts.length; i++) {
            Child found = null;
            for (Child child : children(tree, parent)) if (child.name.equals(parts[i])) { found = child; break; }
            if (found == null) {
                if (createParents) { parent = DocumentsContract.createDocument(getContext().getContentResolver(), parent, DocumentsContract.Document.MIME_TYPE_DIR, parts[i]); continue; }
                throw new java.io.FileNotFoundException("Vault file not found.");
            }
            if (i < parts.length - 1 && !found.directory) throw new IllegalStateException("Vault path is not a folder.");
            parent = found.uri;
        }
        return parent;
    }
    private byte[] readBytes(Uri document) throws Exception {
        try (InputStream input = getContext().getContentResolver().openInputStream(document); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalStateException("File unavailable.");
            byte[] buffer = new byte[65536]; int count;
            while ((count = input.read(buffer)) != -1) { if (output.size() + count > MAX_BYTES) throw new IllegalArgumentException("Choose a note smaller than 20 MB."); output.write(buffer, 0, count); }
            return output.toByteArray();
        }
    }
    private String readText(Uri document) throws Exception { return new String(readBytes(document), StandardCharsets.UTF_8); }
    @PluginMethod public void asset(PluginCall call) { worker.execute(() -> {
        try {
            String relative = call.getString("path"); path(relative);
            if (!relative.matches("(?i).*\\.(png|jpe?g|webp|gif|svg|avif|bmp)$")) throw new IllegalArgumentException("Choose a local image.");
            Uri document = find(tree(call.getString("id")), relative, false);
            String mime = getContext().getContentResolver().getType(document);
            JSObject response = new JSObject(); response.put("base64", android.util.Base64.encodeToString(readBytes(document), android.util.Base64.NO_WRAP)); response.put("mime", mime); call.resolve(response);
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }); }
    private void walk(Uri tree, Uri parent, String prefix, int depth, JSArray paths, boolean showHidden) throws Exception {
        if (depth > 32) throw new IllegalArgumentException("Too many vault folder levels.");
        for (Child child : children(tree, parent)) {
            if (!showHidden && child.name.startsWith(".")) continue;
            if (paths.length() >= 20000) throw new IllegalArgumentException("Choose a vault with fewer than 20,000 notes.");
            String relative = prefix + child.name;
            if (child.directory) { paths.put(relative + "/"); walk(tree, child.uri, relative + "/", depth + 1, paths, showHidden); }
            else if (child.name.matches("(?i).*\\.(md|markdown|txt|slate-notebook)$")) paths.put(relative);
        }
    }
    @PluginMethod public void list(PluginCall call) { worker.execute(() -> {
        try { Uri tree = tree(call.getString("id")); JSArray paths = new JSArray(); walk(tree, DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)), "", 0, paths, call.getBoolean("showHidden", false)); JSObject response = new JSObject(); response.put("paths", paths); call.resolve(response); }
        catch (Exception error) { call.reject("Reconnect the vault to read this folder: " + error.getMessage(), error); }
    }); }
    @PluginMethod public void read(PluginCall call) { worker.execute(() -> {
        try { Uri tree = tree(call.getString("id")); JSObject response = new JSObject(); response.put("text", readText(find(tree, call.getString("path"), false))); call.resolve(response); }
        catch (Exception error) { call.reject(error.getMessage(), error); }
    }); }
    private Uri parent(Uri tree, String relative) throws Exception {
        int slash = relative.lastIndexOf('/');
        return slash < 0 ? DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)) : find(tree, relative.substring(0, slash), false);
    }
    @PluginMethod public void mkdir(PluginCall call) { worker.execute(() -> {
        try {
            String relative = call.getString("path"); String[] parts = path(relative); Uri tree = tree(call.getString("id")), owner = parent(tree, relative); String name = parts[parts.length - 1];
            for (Child child : children(tree, owner)) if (child.name.equalsIgnoreCase(name)) throw new IllegalStateException("A file or folder with that name already exists here.");
            Uri created = DocumentsContract.createDocument(getContext().getContentResolver(), owner, DocumentsContract.Document.MIME_TYPE_DIR, name);
            if (created == null || !displayName(created).equals(name)) throw new IllegalStateException("The provider could not create that folder name. Refresh the vault.");
            call.resolve();
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }); }
    @PluginMethod public void rename(PluginCall call) { worker.execute(() -> {
        try {
            String relative = call.getString("path"), nextPath = call.getString("nextPath"); String[] parts = path(relative), next = path(nextPath);
            String oldParent = relative.substring(0, relative.length() - parts[parts.length - 1].length()), newParent = nextPath.substring(0, nextPath.length() - next[next.length - 1].length());
            if (!oldParent.equals(newParent)) throw new IllegalArgumentException("Rename within the same folder.");
            Uri tree = tree(call.getString("id")), owner = parent(tree, relative), document = find(tree, relative, false); String name = next[next.length - 1];
            for (Child child : children(tree, owner)) if (!child.name.equals(parts[parts.length - 1]) && child.name.equalsIgnoreCase(name)) throw new IllegalStateException("A file or folder with that name already exists here.");
            boolean directory = call.getBoolean("directory", false);
            if (!directory && (call.getString("expected") == null || !Objects.equals(readText(document), call.getString("expected")))) throw new IllegalStateException("Vault conflict: the original file changed.");
            Uri renamed = DocumentsContract.renameDocument(getContext().getContentResolver(), document, name);
            if (renamed == null) throw new IllegalStateException("This folder provider does not support renaming.");
            if (!displayName(renamed).equals(name)) {
                DocumentsContract.renameDocument(getContext().getContentResolver(), renamed, parts[parts.length - 1]);
                throw new IllegalStateException("The provider changed that name. Refresh the vault before trying again.");
            }
            call.resolve();
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }); }
    @PluginMethod public void write(PluginCall call) { worker.execute(() -> {
        Uri temporary = null, backup = null; String name = null;
        try {
            Uri tree = tree(call.getString("id")); String relative = call.getString("path"), text = call.getString("text");
            String[] parts = path(relative); name = parts[parts.length - 1];
            if (!name.matches("(?i).*\\.(md|markdown|txt|slate-notebook)$") || text == null || text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new IllegalArgumentException("Invalid vault write.");
            Uri original = null; String actual = null;
            try { original = find(tree, relative, false); actual = readText(original); } catch (java.io.FileNotFoundException ignored) { }
            if (!Objects.equals(actual, call.getString("expected"))) throw new IllegalStateException("Vault conflict: the original file changed.");
            Uri parent = parts.length == 1 ? DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)) : find(tree, relative.substring(0, relative.lastIndexOf('/')), true);
            String mime = name.endsWith(".slate-notebook") ? "application/json" : "text/markdown";
            temporary = DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, ".slate-tmp-" + UUID.randomUUID());
            if (temporary == null) throw new IllegalStateException("This folder is not writable.");
            try (OutputStream output = getContext().getContentResolver().openOutputStream(temporary, "wt")) { if (output == null) throw new IllegalStateException("File unavailable."); output.write(text.getBytes(StandardCharsets.UTF_8)); output.flush(); }
            if (!text.equals(readText(temporary))) throw new IllegalStateException("The prepared file could not be verified.");
            if (original != null) {
                backup = DocumentsContract.renameDocument(getContext().getContentResolver(), original, ".slate-backup-" + UUID.randomUUID());
                if (backup == null) throw new IllegalStateException("Choose a local provider supporting safe file replacement.");
            }
            Uri committed = DocumentsContract.renameDocument(getContext().getContentResolver(), temporary, name);
            if (committed == null) throw new IllegalStateException("This provider cannot safely replace files. Choose a local folder.");
            temporary = null;
            if (backup != null) { try { DocumentsContract.deleteDocument(getContext().getContentResolver(), backup); } catch (Exception ignored) { } backup = null; }
            call.resolve();
        } catch (Exception error) {
            if (backup != null) { try { DocumentsContract.renameDocument(getContext().getContentResolver(), backup, name); } catch (Exception ignored) { } }
            call.reject(error.getMessage(), error);
        } finally { if (temporary != null) { try { DocumentsContract.deleteDocument(getContext().getContentResolver(), temporary); } catch (Exception ignored) { } } }
    }); }
}
