import chalk from 'chalk';
import { readPackageJSON } from 'pkg-types';
import { getBorderCharacters, table } from 'table';

export async function getStartMessage() {
    const pkg = await readPackageJSON();

    return table(
        [
            [chalk.blue('▰▱'.repeat(30))],
            [chalk.blue(`🌊 Remnawave Backend v${pkg.version}`)],
            [chalk.gray('─'.repeat(60))],
            [
                chalk.cyan('📚 Documentation') +
                    chalk.gray(' ········ ') +
                    chalk.white('https://docs.rw'),
            ],
            [
                chalk.green('💬 Community') +
                    chalk.gray(' ······ ') +
                    chalk.white('https://t.me/remnawave'),
            ],
            [chalk.gray('─'.repeat(60))],
            [
                chalk.yellow('🛠️  Rescue CLI') +
                    chalk.gray(' ······ ') +
                    chalk.dim('docker exec -it remnawave cli'),
            ],
            [chalk.blue('▰▱'.repeat(30))],
        ],
        {
            columnDefault: {
                width: 64,
            },
            columns: {
                0: { alignment: 'center' },
            },
            drawVerticalLine: () => false,
            drawHorizontalLine: () => false,
            border: getBorderCharacters('honeywell'),
        },
    );
}
