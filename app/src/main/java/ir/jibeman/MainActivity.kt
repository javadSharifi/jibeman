package ir.jibeman

import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.widget.Toast
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import ir.jibeman.feature.AccountDetailScreen
import ir.jibeman.feature.AccountsScreen
import ir.jibeman.feature.AddReq
import ir.jibeman.feature.BackupScreen
import ir.jibeman.feature.CategoriesScreen
import ir.jibeman.feature.EditAccountScreen
import ir.jibeman.feature.HomeScreen
import ir.jibeman.feature.MonthlyReportScreen
import ir.jibeman.feature.MoreScreen
import ir.jibeman.feature.QuickAddSheet
import ir.jibeman.feature.Route
import ir.jibeman.feature.SecurityScreen
import ir.jibeman.feature.SmsReviewScreen
import ir.jibeman.feature.TxnsScreen
import ir.jibeman.feature.tab
import ir.jibeman.ui.C
import ir.jibeman.ui.Dock
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.JibeTheme
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.T
import ir.jibeman.ui.ThemeMode
import ir.jibeman.ui.heroBg
import ir.jibeman.ui.themeBackground

import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.rememberCoroutineScope
import ir.jibeman.ui.PinDots
import ir.jibeman.ui.PinKeypad
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : FragmentActivity() {
    private var locked by mutableStateOf(false)
    private var stoppedAt = 0L

    // Keep the document pickers alive when the app locks while the system picker is open.
    private var pendingBackupExport: String? = null
    var backupImport by mutableStateOf<Uri?>(null)
        private set
    private val backupExporter = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val payload = pendingBackupExport
        pendingBackupExport = null
        if (uri != null && payload != null) lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    checkNotNull(contentResolver.openOutputStream(uri, "wt")).use { it.write(payload.encodeToByteArray()) }
                }
                (application as App).prefs.lastBackupAt = System.currentTimeMillis()
                Toast.makeText(this@MainActivity, "پشتیبان رمزنگاری‌شده ذخیره شد.", Toast.LENGTH_LONG).show()
            } catch (_: Exception) {
                Toast.makeText(this@MainActivity, "ذخیرهٔ فایل پشتیبان ممکن نشد.", Toast.LENGTH_LONG).show()
            }
        }
    }
    private val backupImporter = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        backupImport = uri
    }

    fun saveBackupFile(name: String, encrypted: String) {
        pendingBackupExport = encrypted
        backupExporter.launch(name)
    }

    fun chooseBackupFile() = backupImporter.launch(arrayOf("application/json", "application/octet-stream", "text/plain"))

    fun dismissBackupImport() { backupImport = null }

    override fun onCreate(savedInstanceState: Bundle?) {
        val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        val mode = (application as App).prefs.theme
        val darkChrome = when (mode) {
            ThemeMode.SYSTEM -> night
            ThemeMode.LIGHT -> false
            ThemeMode.DARK -> true
        }
        val barStyle = if (darkChrome) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        enableEdgeToEdge(barStyle, barStyle)
        // the xml window background follows the system, so override it when the user picked a theme
        window.setBackgroundDrawable(ColorDrawable(themeBackground(mode, night)))
        super.onCreate(savedInstanceState)
        val app = application as App
        locked = app.prefs.lockEnabled && app.prefs.hasPin
        setContent {
            JibeTheme(app.prefs.theme) {
                if (locked) LockScreen(this) { locked = false } else AppRoot(this@MainActivity)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        val app = application as App
        if (app.prefs.lockEnabled && app.prefs.hasPin && stoppedAt > 0 && SystemClock.elapsedRealtime() - stoppedAt > app.prefs.lockTimeoutMs) {
            locked = true
        }
    }

    override fun onStop() {
        super.onStop()
        stoppedAt = SystemClock.elapsedRealtime()
    }
}

fun FragmentActivity.authenticate(title: String, onOk: () -> Unit) {
    val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onOk()
    })
    val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle(title)
        .setNegativeButtonText("ورود با رمز پین")
        .setAllowedAuthenticators(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK or androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG)
        .build()
    runCatching { prompt.authenticate(info) }
}

@Composable
private fun LockScreen(activity: FragmentActivity, unlock: () -> Unit) {
    val app = app()
    var pin by remember { mutableStateOf("") }
    var isError by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun triggerBiometric() {
        if (app.prefs.biometricEnabled) {
            activity.authenticate("ورود به جیب من") { unlock() }
        }
    }

    LaunchedEffect(Unit) {
        if (app.prefs.biometricEnabled) {
            triggerBiometric()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .heroBg()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(top = 28.dp),
        ) {
            Box(
                Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(C.lime),
                contentAlignment = Alignment.Center,
            ) {
                Ico(Ic.lock, 28.dp, C.onLime)
            }
            T("جیب من", 20, 800, modifier = Modifier.padding(top = 12.dp))
            T(
                if (isError) "رمز وارد شده اشتباه است" else "برنامه قفل است · رمز ۴ رقمی را وارد کنید",
                12.5f,
                color = if (isError) C.bad else C.t2,
                modifier = Modifier.padding(top = 4.dp),
            )
            PinDots(
                length = pin.length,
                isError = isError,
                modifier = Modifier.padding(top = 24.dp),
            )
        }

        PinKeypad(
            onDigit = { d ->
                if (pin.length < 4) {
                    val next = pin + d
                    pin = next
                    isError = false
                    if (next.length == 4) {
                        if (app.prefs.verifyPin(next)) {
                            unlock()
                        } else {
                            isError = true
                            scope.launch {
                                kotlinx.coroutines.delay(400)
                                pin = ""
                            }
                        }
                    }
                }
            },
            onDelete = {
                if (pin.isNotEmpty()) {
                    pin = pin.dropLast(1)
                    isError = false
                }
            },
            onBiometric = if (app.prefs.biometricEnabled) ::triggerBiometric else null,
            modifier = Modifier.padding(bottom = 12.dp),
        )
    }
}

@Composable
private fun AppRoot(activity: MainActivity) {
    var stack by remember { mutableStateOf(listOf<Route>(Route.Home)) }
    var sheet by remember { mutableStateOf<AddReq?>(null) }
    val top = stack.last()
    fun go(r: Route) { stack = if (r.tab >= 0) listOf(r) else stack + r }
    fun back() {
        if (stack.last() == Route.Backup) activity.dismissBackupImport()
        stack = if (stack.size > 1) stack.dropLast(1) else listOf(Route.Home)
    }
    LaunchedEffect(activity.backupImport) {
        if (activity.backupImport != null && stack.last() != Route.Backup) go(Route.Backup)
    }
    BackHandler(stack.size > 1 || top != Route.Home) { back() }

    Box(Modifier.fillMaxSize().background(C.bg)) {
        when (top) {
            Route.Home -> HomeScreen(::go) { sheet = it }
            is Route.Txns -> TxnsScreen(top.accountId, if (top.accountId == 0L) null else ::back) { sheet = it }
            Route.Accounts -> AccountsScreen(::go)
            Route.More -> MoreScreen(::go)
            is Route.AccountDetail -> AccountDetailScreen(top.id, ::back, ::go) { sheet = it }
            is Route.EditAccount -> EditAccountScreen(top.id, ::back)
            Route.Categories -> CategoriesScreen(::back)
            Route.Backup -> BackupScreen(activity, ::back)
            Route.Security -> SecurityScreen(::back)
            Route.SmsReview -> SmsReviewScreen(::back) { sheet = it }
            Route.Loans -> ir.jibeman.feature.LoansScreen(::back, ::go)
            is Route.LoanDetail -> ir.jibeman.feature.LoanDetailScreen(top.id, ::back, ::go)
            is Route.EditLoan -> ir.jibeman.feature.EditLoanScreen(top.id, ::back)
            Route.Debts -> ir.jibeman.feature.DebtsScreen(::back, ::go)
            is Route.DebtDetail -> ir.jibeman.feature.DebtDetailScreen(top.id, ::back)
            Route.Rules -> ir.jibeman.feature.RulesScreen(::back)
            Route.Goals -> ir.jibeman.feature.GoalsScreen(::back, ::go)
            is Route.GoalDetail -> ir.jibeman.feature.GoalDetailScreen(top.id, ::back)
            Route.People -> ir.jibeman.feature.PeopleScreen(::back, ::go)
            is Route.PersonDetail -> ir.jibeman.feature.PersonDetailScreen(top.id, ::back, ::go)
            Route.Splits -> ir.jibeman.feature.SplitsScreen(::back, ::go)
            is Route.SplitDetail -> ir.jibeman.feature.SplitDetailScreen(top.id, ::back)
            is Route.MonthlyReport -> MonthlyReportScreen(top.accountId, ::back, ::go) { sheet = it }
        }
        if (top.tab >= 0) Dock(
            top.tab, modifier = Modifier.align(Alignment.BottomCenter),
            onTab = { go(listOf(Route.Home, Route.Txns(), Route.Accounts, Route.More)[it]) },
            onAdd = { sheet = AddReq() },
        )
    }
    sheet?.let { req -> QuickAddSheet(req) { toAccounts -> sheet = null; if (toAccounts) go(Route.EditAccount(0)) } }
}
