export class KeygenResponseModel {
    public secretKey: string;
    public pubKey: string; // TODO: remove

    constructor(payload: string) {
        this.secretKey = payload;
        this.pubKey = payload;
    }
}
