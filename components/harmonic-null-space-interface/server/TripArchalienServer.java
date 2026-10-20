import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Local-only RFC 6455 WebSocket bridge for the HNSI simulation.
 * Binds exclusively to 127.0.0.1. It accepts simulation metrics, not commands.
 */
public final class TripArchalienServer {
    private static final String HOST = "127.0.0.1";
    private static final int PORT = 8082;
    private static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final ExecutorService CLIENTS = Executors.newCachedThreadPool();
    private static volatile int connectedClients = 0;

    public static void main(String[] args) throws Exception {
        try (ServerSocket server = new ServerSocket()) {
            server.setReuseAddress(true);
            server.bind(new InetSocketAddress(InetAddress.getByName(HOST), PORT));
            System.out.println("Trip Archalien local bridge listening at ws://" + HOST + ":" + PORT);
            System.out.println("Protocol: HNSI_UPDATE -> validated simulation metrics -> HNSI_STATE");
            System.out.println("Safety: loopback only; no shell, filesystem, or arbitrary command endpoint.");
            while (true) {
                Socket client = server.accept();
                client.setSoTimeout(120_000);
                CLIENTS.submit(() -> handle(client));
            }
        }
    }

    private static void handle(Socket socket) {
        try (socket) {
            InputStream in = new BufferedInputStream(socket.getInputStream());
            OutputStream out = new BufferedOutputStream(socket.getOutputStream());
            String request = readHttpHeaders(in);
            if (request == null || !request.startsWith("GET ")) {
                writeHttp(out, "400 Bad Request", "text/plain", "Expected WebSocket GET handshake");
                return;
            }
            String path = request.split(" ")[1];
            if ("/health".equals(path)) {
                writeHttp(out, "200 OK", "application/json", "{\"status\":\"ONLINE\",\"node\":\"Trip Archalien\",\"bind\":\"127.0.0.1\"}");
                return;
            }
            String key = header(request, "Sec-WebSocket-Key");
            String upgrade = header(request, "Upgrade");
            if (!"/".equals(path) || key == null || !"websocket".equalsIgnoreCase(upgrade)) {
                writeHttp(out, "404 Not Found", "text/plain", "WebSocket endpoint is /");
                return;
            }
            String accept = Base64.getEncoder().encodeToString(
                MessageDigest.getInstance("SHA-1").digest((key.trim() + GUID).getBytes(StandardCharsets.ISO_8859_1)));
            out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "
                + accept + "\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
            out.flush();
            connectedClients++;
            sendText(out, "{\"type\":\"HELLO\",\"node\":\"Trip Archalien\",\"status\":\"ONLINE\",\"connectedClients\":" + connectedClients + ",\"scope\":\"SIMULATION_ONLY\"}");
            System.out.println("Client connected; active=" + connectedClients);
            while (!socket.isClosed()) {
                Frame frame = readFrame(in);
                if (frame == null) break;
                if (frame.opcode == 8) { writeFrame(out, 8, frame.payload); break; }
                if (frame.opcode == 9) { writeFrame(out, 10, frame.payload); continue; }
                if (frame.opcode != 1) continue;
                String message = new String(frame.payload, StandardCharsets.UTF_8);
                String reply = process(message);
                sendText(out, reply);
            }
        } catch (SocketTimeoutException e) {
            System.out.println("Client timed out.");
        } catch (Exception e) {
            System.out.println("Client ended: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        } finally {
            if (!socket.isClosed()) {
                try { socket.close(); } catch (IOException ignored) {}
            }
            if (connectedClients > 0) connectedClients--;
        }
    }

    private static String process(String json) {
        if (json.length() > 8192) return error("message_too_large");
        String type = stringField(json, "type");
        if (!"HNSI_UPDATE".equals(type)) return error("unsupported_message_type");
        Double target = numberField(json, "targetRms");
        Double residual = numberField(json, "residualRms");
        Double attenuation = numberField(json, "attenuationDb");
        if (target == null || residual == null || attenuation == null ||
            !Double.isFinite(target) || !Double.isFinite(residual) || !Double.isFinite(attenuation) ||
            target < 0 || residual < 0 || target > 1_000_000 || residual > 1_000_000 ||
            attenuation < -300 || attenuation > 300) return error("invalid_metrics");
        // "Syntropy" is a coined UI label for bounded residual reduction in this synthetic model.
        // It has no biological or medical interpretation.
        double score = target < 1e-12 ? 0.0 : Math.max(0.0, Math.min(1.0, 1.0 - residual / target));
        return String.format(java.util.Locale.ROOT,
            "{\"type\":\"HNSI_STATE\",\"node\":\"Trip Archalien\",\"status\":\"ONLINE\",\"scope\":\"SIMULATION_ONLY\",\"targetRms\":%.8f,\"residualRms\":%.8f,\"attenuationDb\":%.4f,\"syntropyScore\":%.6f,\"connectedClients\":%d}",
            target, residual, attenuation, score, connectedClients);
    }

    private static String error(String code) {
        return "{\"type\":\"ERROR\",\"node\":\"Trip Archalien\",\"code\":\"" + code + "\"}";
    }

    private static String stringField(String json, String key) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"([^\"]{0,80})\"").matcher(json);
        return m.find() ? m.group(1) : null;
    }

    private static Double numberField(String json, String key) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)").matcher(json);
        if (!m.find()) return null;
        try { return Double.valueOf(m.group(1)); } catch (NumberFormatException e) { return null; }
    }

    private static String readHttpHeaders(InputStream in) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int state = 0, b;
        while ((b = in.read()) != -1 && bytes.size() < 16384) {
            bytes.write(b);
            if ((state == 0 && b == '\r') || (state == 2 && b == '\r')) state++;
            else if ((state == 1 && b == '\n') || (state == 3 && b == '\n')) {
                if (state == 3) break;
                state++;
            } else state = (b == '\r') ? 1 : 0;
        }
        return bytes.toString(StandardCharsets.ISO_8859_1);
    }

    private static String header(String request, String name) {
        for (String line : request.split("\r\n")) {
            int colon = line.indexOf(':');
            if (colon > 0 && line.substring(0, colon).trim().equalsIgnoreCase(name))
                return line.substring(colon + 1).trim();
        }
        return null;
    }

    private static void writeHttp(OutputStream out, String status, String type, String body) throws IOException {
        byte[] data = body.getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 " + status + "\r\nContent-Type: " + type + "; charset=utf-8\r\nContent-Length: " + data.length +
            "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        out.write(data);
        out.flush();
    }

    private static Frame readFrame(InputStream in) throws IOException {
        int first = in.read();
        if (first < 0) return null;
        int second = in.read();
        if (second < 0) return null;
        int opcode = first & 0x0F;
        boolean masked = (second & 0x80) != 0;
        long len = second & 0x7F;
        if (len == 126) len = ((long) in.read() << 8) | in.read();
        else if (len == 127) {
            len = 0;
            for (int i = 0; i < 8; i++) len = (len << 8) | (in.read() & 0xFF);
        }
        if (len < 0 || len > 8192) throw new IOException("frame too large");
        byte[] mask = masked ? in.readNBytes(4) : new byte[0];
        if (masked && mask.length != 4) throw new EOFException("incomplete mask");
        byte[] payload = in.readNBytes((int) len);
        if (payload.length != len) throw new EOFException("incomplete frame");
        if (masked) for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        return new Frame(opcode, payload);
    }

    private static void sendText(OutputStream out, String text) throws IOException {
        writeFrame(out, 1, text.getBytes(StandardCharsets.UTF_8));
    }

    private static void writeFrame(OutputStream out, int opcode, byte[] payload) throws IOException {
        out.write(0x80 | opcode);
        if (payload.length < 126) out.write(payload.length);
        else if (payload.length <= 65535) {
            out.write(126); out.write((payload.length >>> 8) & 255); out.write(payload.length & 255);
        } else throw new IOException("outgoing frame too large");
        out.write(payload); out.flush();
    }

    private static final class Frame {
        final int opcode; final byte[] payload;
        Frame(int opcode, byte[] payload) { this.opcode = opcode; this.payload = payload; }
    }
}

[executed on device: ZDH (77b98796-cf81-45a3-96ca-7c08c8e2b595)]