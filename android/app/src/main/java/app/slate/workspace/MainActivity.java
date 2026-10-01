package app.slate.workspace;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(SlateExportPlugin.class);
        registerPlugin(SlateVaultPlugin.class);
        super.onCreate(state);
    }
}
