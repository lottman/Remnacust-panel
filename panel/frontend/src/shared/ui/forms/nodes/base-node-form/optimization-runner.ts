export type OptimizationLevel = 'none' | 'safe' | 'balanced' | 'performance'

// Only fixed profiles and a client-generated UUID may enter the shell command.
export function optimizationCommand(script: string, level: OptimizationLevel, id: string) {
    if (!['none', 'safe', 'balanced', 'performance'].includes(level) || !/^[a-f0-9-]{36}$/.test(id))
        throw new Error('Invalid optimization request')
    const encoded =
        btoa(script)
            .match(/.{1,76}/g)
            ?.join('\n') ?? ''
    return `(set +e; set -o pipefail; base64 -d <<'XERA_NODE_OPTIMIZER' | { if [ "$(id -u)" -eq 0 ]; then bash -s -- apply ${level}; else sudo -n bash -s -- apply ${level}; fi; }\n${encoded}\nXERA_NODE_OPTIMIZER\nxera_result=$?; printf '\\n%s:%s\\n' 'XERA_OPT_RESULT_${id}' "$xera_result")\n`
}

export class OptimizationRunner {
    private current: { id: string; finish: (error?: Error) => void } | null = null
    private buffer = ''
    private decoder = new TextDecoder()

    run(
        id: string,
        command: string,
        write: (command: string) => void,
        timeout = 120000
    ): Promise<void> {
        if (this.current) return Promise.reject(new Error('Optimization is already running'))
        return new Promise((resolve, reject) => {
            this.buffer = ''
            this.decoder = new TextDecoder()
            const timer = setTimeout(
                () => this.cancel('No result received. Check the node before retrying.'),
                timeout
            )
            this.current = {
                id,
                finish: (error) => {
                    clearTimeout(timer)
                    this.current = null
                    this.buffer = ''
                    if (error) reject(error)
                    else resolve()
                }
            }
            try {
                write(command)
            } catch {
                this.cancel('Could not send the optimization command')
            }
        })
    }

    data(chunk: Uint8Array) {
        if (!this.current) return
        this.buffer = (this.buffer + this.decoder.decode(chunk, { stream: true })).slice(-8192)
        const match = this.buffer.match(
            new RegExp(`(?:^|[\\r\\n])XERA_OPT_RESULT_${this.current.id}:(\\d+)\\r?\\n`)
        )
        if (match)
            this.current.finish(
                match[1] === '0'
                    ? undefined
                    : new Error(`Optimization failed (exit ${match[1]}). See terminal output.`)
            )
    }

    cancel(message = 'SSH connection closed. Check the node before retrying.') {
        this.current?.finish(new Error(message))
    }
}
