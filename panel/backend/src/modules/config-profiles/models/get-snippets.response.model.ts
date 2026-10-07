import { SnippetEntity } from '../entities';
import { BaseSnippetResponseModel } from './base-snippet.response.model';

export class GetSnippetsResponseModel {
    public readonly total: number;
    public readonly snippets: BaseSnippetResponseModel[];

    constructor(snippets: SnippetEntity[], total: number) {
        this.total = total;
        this.snippets = snippets.map((snippet) => new BaseSnippetResponseModel(snippet));
    }
}
