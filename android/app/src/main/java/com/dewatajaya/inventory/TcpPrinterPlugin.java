package com.dewatajaya.inventory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * TcpPrinterPlugin — Custom Capacitor plugin
 * Kirim raw ESC/P data ke Epson TM-U220 via TCP port 9100
 */
@CapacitorPlugin(name = "TcpPrinter")
public class TcpPrinterPlugin extends Plugin {

    /**
     * Print: kirim data ke printer
     * JS call: TcpPrinter.print({ ip, port, data })
     */
    @PluginMethod
    public void print(PluginCall call) {
        String ip   = call.getString("ip", "192.168.1.100");
        int    port = call.getInt("port", 9100);
        String data = call.getString("data", "");

        if (data.isEmpty()) {
            call.reject("Data print tidak boleh kosong");
            return;
        }

        // Jalankan di thread terpisah agar tidak block UI
        new Thread(() -> {
            try {
                Socket socket = new Socket(ip, port);
                socket.setSoTimeout(5000); // timeout 5 detik

                OutputStream out = socket.getOutputStream();
                // Encode ke bytes — ESC/P pakai charset ISO-8859-1
                out.write(data.getBytes(StandardCharsets.ISO_8859_1));
                out.flush();
                socket.close();

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("message", "Berhasil dicetak ke " + ip + ":" + port);
                call.resolve(result);

            } catch (Exception e) {
                call.reject("Gagal cetak: " + e.getMessage());
            }
        }).start();
    }

    /**
     * Ping: cek apakah printer bisa dijangkau
     * JS call: TcpPrinter.ping({ ip, port })
     */
    @PluginMethod
    public void ping(PluginCall call) {
        String ip   = call.getString("ip", "192.168.1.100");
        int    port = call.getInt("port", 9100);

        new Thread(() -> {
            try {
                Socket socket = new Socket(ip, port);
                socket.setSoTimeout(3000);
                socket.close();

                JSObject result = new JSObject();
                result.put("reachable", true);
                result.put("message", "Printer online di " + ip);
                call.resolve(result);
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("reachable", false);
                result.put("message", "Printer tidak terjangkau: " + e.getMessage());
                call.resolve(result);
            }
        }).start();
    }
}

