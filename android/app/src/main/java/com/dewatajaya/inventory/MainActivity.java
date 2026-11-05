package com.dewatajaya.inventory;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Register custom TCP Printer plugin
        registerPlugin(TcpPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
