/* eslint-disable no-param-reassign */
import xbytes from 'xbytes'

export function prettifyBytesUtil(
    bytesInput: null | number | string | undefined,
    returnZero: true
): string
export function prettifyBytesUtil(
    bytesInput: null | number | string | undefined,
    returnZero?: false
): string | undefined
export function prettifyBytesUtil(
    bytesInput: null | number | string | undefined,
    returnZero: boolean = false
): string | undefined {
    if (typeof bytesInput === 'string') {
        bytesInput = Number(bytesInput)
    }
    if (!bytesInput) {
        return returnZero ? '0' : undefined
    }

    return xbytes(bytesInput, { iec: true })
}

export function prettySiBytesUtil(
    bytesInput: number | string | undefined,
    returnZero: boolean = false
): string | undefined {
    if (typeof bytesInput === 'string') {
        bytesInput = Number(bytesInput)
    }
    if (!bytesInput) {
        return returnZero ? '0 B' : undefined
    }

    return xbytes(bytesInput, { iec: false })
}

export function prettySiRealtimeBytesUtil(
    bytesInput: number | string | undefined,
    returnZero: boolean = false,
    withSeconds: boolean = false
): string | undefined {
    if (typeof bytesInput === 'string') {
        bytesInput = Number(bytesInput)
    }
    if (!bytesInput) {
        return returnZero ? '0 B/s' : undefined
    }

    const res = xbytes(bytesInput, { iec: false, bits: true })

    return `${res}${withSeconds ? '/s' : ''}`
}
