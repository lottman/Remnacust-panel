interface IMetadata {
    version: string;
    backendCommitSha: string;
    frontendCommitSha: string;
    branch: string;
    buildTime: string;
    buildNumber: string;
}

export class GetMetadataResponseModel {
    version: string;
    build: {
        time: string;
        number: string;
    };
    git: {
        backend: {
            commitSha: string;
            branch: string;
            commitUrl: string;
        };
        frontend: {
            commitSha: string;
            commitUrl: string;
        };
    };

    constructor(data: IMetadata) {
        this.version = data.version;
        this.build = {
            time: data.buildTime,
            number: data.buildNumber,
        };
        this.git = {
            backend: {
                commitSha: data.backendCommitSha,
                branch: data.branch,
                commitUrl: /^[\da-f]{40}$/i.test(data.backendCommitSha)
                    ? `https://github.com/lottman/Remnacust-panel/commit/${data.backendCommitSha}`
                    : 'https://github.com/lottman/Remnacust-panel',
            },
            frontend: {
                commitSha: data.frontendCommitSha,
                commitUrl: /^[\da-f]{40}$/i.test(data.frontendCommitSha)
                    ? `https://github.com/lottman/Remnacust-panel/commit/${data.frontendCommitSha}`
                    : 'https://github.com/lottman/Remnacust-panel',
            },
        };
    }
}
