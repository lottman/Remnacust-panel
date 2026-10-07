export class GetAllHostTagsResponseModel {
    public readonly tags: string[];

    constructor(data: string[]) {
        this.tags = data;
    }
}
