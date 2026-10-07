interface IX25519KeypairsResponseData {
    publicKey: string;
    privateKey: string;
}

export class GenerateX25519ResponseModel {
    keypairs: IX25519KeypairsResponseData[];

    constructor(data: IX25519KeypairsResponseData[]) {
        this.keypairs = data;
    }
}
