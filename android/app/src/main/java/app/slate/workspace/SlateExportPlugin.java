package app.slate.workspace;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "SlateExport")
public class SlateExportPlugin extends Plugin {
    private volatile boolean exportInProgress = false;
    private File sourceFile(PluginCall call) throws Exception {
        String source = call.getString("source");
        if (source == null) throw new IllegalArgumentException("Missing prepared copy.");
        Uri uri = Uri.parse(source);
        if (!"file".equals(uri.getScheme()) || uri.getPath() == null)
            throw new IllegalArgumentException("Invalid prepared copy.");
        File file = new File(uri.getPath()).getCanonicalFile();
        String allowed = new File(getContext().getCacheDir(), "exports").getCanonicalPath() + File.separator;
        if (!file.getPath().startsWith(allowed) || !file.isFile())
            throw new IllegalArgumentException("Prepared copy is unavailable.");
        return file;
    }
    @PluginMethod
    public synchronized void save(PluginCall call) {
        if (exportInProgress) {
            call.reject("Finish saving the current copy before exporting another.");
            return;
        }
        exportInProgress = true;
        try {
            sourceFile(call);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(call.getString("mime", "application/octet-stream"));
            intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "Slate export"));
            startActivityForResult(call, intent, "saveResult");
        } catch (Exception exception) {
            exportInProgress = false;
            call.reject("The save dialog couldn’t open. Try exporting again.");
        }
    }
    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) { exportInProgress = false; return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            exportInProgress = false;
            JSObject response = new JSObject(); response.put("saved", false); call.resolve(response); return;
        }
        Uri destination = result.getData().getData();
        getBridge().execute(() -> {
            try {
                File source = sourceFile(call); long copied = 0;
                try (FileInputStream input = new FileInputStream(source);
                     OutputStream output = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new IllegalStateException("Destination unavailable.");
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.read(buffer)) != -1) { output.write(buffer, 0, count); copied += count; }
                    output.flush();
                    if (copied != source.length()) throw new IllegalStateException("Incomplete copy.");
                }
                JSObject response = new JSObject(); response.put("saved", true); call.resolve(response);
            } catch (Exception exception) {
                call.reject("Your copy couldn’t be saved. Choose another location and try again.");
            } finally {
                exportInProgress = false;
            }
        });
    }
}
