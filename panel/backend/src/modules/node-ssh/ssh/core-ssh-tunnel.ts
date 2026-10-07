import { createServer, Server, Socket } from 'node:net';
import type { Client, ClientChannel } from 'ssh2';

const FAILURE = Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]);
const DENIED = Buffer.from([5, 2, 0, 1, 0, 0, 0, 0, 0, 0]);
const SUCCESS = Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]);

/** A loopback-only SOCKS bridge to the node API over an authenticated SSH session. */
export class CoreSshTunnel {
    private readonly server: Server;
    private readonly sockets = new Set<Socket>();
    private readonly channels = new Set<ClientChannel>();

    constructor(
        private readonly ssh: Client,
        private readonly hosts: readonly string[],
        private readonly nodePort: number,
    ) {
        this.server = createServer((socket) => this.accept(socket));
    }

    async listen(): Promise<number> {
        await new Promise<void>((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(0, '127.0.0.1', () => {
                this.server.off('error', reject);
                resolve();
            });
        });
        const address = this.server.address();
        if (!address || typeof address === 'string') throw new Error('SSH tunnel did not bind');
        return address.port;
    }

    close(): void {
        for (const channel of this.channels) channel.destroy();
        for (const socket of this.sockets) socket.destroy();
        if (this.server.listening) this.server.close();
    }

    private accept(socket: Socket): void {
        this.sockets.add(socket);
        socket.setTimeout(15_000, () => socket.destroy());
        socket.on('close', () => this.sockets.delete(socket));
        socket.on('error', () => socket.destroy());

        let phase: 'greeting' | 'request' | 'connected' = 'greeting';
        let pending = Buffer.alloc(0);
        const onData = (chunk: Buffer) => {
            pending = Buffer.concat([pending, chunk]);
            if (pending.length > 1024) return socket.destroy();
            if (phase === 'greeting') {
                if (pending.length < 2) return;
                const length = 2 + pending[1];
                if (pending.length < length) return;
                if (pending[0] !== 5 || !pending.subarray(2, length).includes(0)) {
                    socket.end(Buffer.from([5, 255]));
                    return;
                }
                pending = pending.subarray(length);
                phase = 'request';
                socket.write(Buffer.from([5, 0]));
            }
            if (phase !== 'request' || pending.length < 5) return;
            const atyp = pending[3];
            const addressLength = atyp === 1 ? 4 : atyp === 3 ? 1 + pending[4] : 0;
            if (!addressLength) return socket.end(DENIED);
            const length = 4 + addressLength + 2;
            if (pending.length < length) return;
            const host = atyp === 1
                ? [...pending.subarray(4, 8)].join('.')
                : pending.subarray(5, 5 + pending[4]).toString('utf8');
            const port = pending.readUInt16BE(length - 2);
            if (pending[0] !== 5 || pending[1] !== 1 || pending[2] !== 0 ||
                port !== this.nodePort || !this.hosts.includes(host)) {
                socket.end(DENIED);
                return;
            }
            const remaining = pending.subarray(length);
            pending = Buffer.alloc(0);
            phase = 'connected';
            socket.off('data', onData);
            this.ssh.forwardOut('127.0.0.1', 0, '127.0.0.1', this.nodePort, (error, channel) => {
                if (error || !channel || socket.destroyed) {
                    socket.end(FAILURE);
                    channel?.destroy();
                    return;
                }
                this.channels.add(channel);
                channel.on('close', () => this.channels.delete(channel));
                channel.on('error', () => socket.destroy());
                socket.setTimeout(0);
                socket.write(SUCCESS);
                if (remaining.length) channel.write(remaining);
                socket.pipe(channel).pipe(socket);
            });
        };
        socket.on('data', onData);
    }
}
