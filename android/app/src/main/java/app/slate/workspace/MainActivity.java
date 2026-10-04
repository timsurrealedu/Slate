package app.slate.workspace;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(SlateExportPlugin.class);
        registerPlugin(SlateVaultPlugin.class);
        super.onCreate(state);
        if (bridge == null) return;

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackStarted(BackEventCompat event) {
                publishBack("start", event.getProgress(), event.getSwipeEdge());
            }
            @Override public void handleOnBackProgressed(BackEventCompat event) {
                publishBack("progress", event.getProgress(), event.getSwipeEdge());
            }
            @Override public void handleOnBackCancelled() {
                publishBack("cancel", 0, 0);
            }
            @Override public void handleOnBackPressed() {
                publishBack("commit", 1, 0);
            }
        });

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attributes);
        }

        View decor = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            // Immersive bars can still report their usual size on some devices.
            // Only physical cutouts need safe space; the IME resizes the WebView once.
            Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            int keyboardBottom = keyboardVisible ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0;
            view.setPadding(0, 0, 0, keyboardBottom);
            publishSafeArea(cutout, keyboardVisible);

            int barsAndCutout = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(barsAndCutout, Insets.NONE)
                .setInsetsIgnoringVisibility(barsAndCutout, Insets.NONE)
                .setDisplayCutout(null)
                .build();
        });
        bridge.addWebViewListener(new WebViewListener() {
            @Override public void onPageCommitVisible(WebView view, String url) {
                ViewCompat.requestApplyInsets(decor);
            }
        });
        enterImmersiveMode();
    }

    @Override public void onResume() {
        super.onResume();
        enterImmersiveMode();
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        if (bridge == null) return;
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decor);
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
        ViewCompat.requestApplyInsets(decor);
    }

    private void publishSafeArea(Insets cutout, boolean keyboardVisible) {
        float density = getResources().getDisplayMetrics().density;
        String script = String.format(Locale.US,
            "document.documentElement.style.setProperty('--safe-area-inset-top','%.3fpx');" +
            "document.documentElement.style.setProperty('--safe-area-inset-right','%.3fpx');" +
            "document.documentElement.style.setProperty('--safe-area-inset-bottom','%.3fpx');" +
            "document.documentElement.style.setProperty('--safe-area-inset-left','%.3fpx');",
            cutout.top / density, cutout.right / density,
            (keyboardVisible ? 0 : cutout.bottom) / density, cutout.left / density);
        bridge.getWebView().evaluateJavascript(script, null);
    }

    private void publishBack(String phase, float progress, int edge) {
        if (bridge == null) return;
        String script = String.format(Locale.US,
            "window.dispatchEvent(new CustomEvent('slate-native-back',{detail:{phase:'%s',progress:%.4f,edge:%d}}));",
            phase, progress, edge);
        bridge.getWebView().evaluateJavascript(script, null);
    }
}
