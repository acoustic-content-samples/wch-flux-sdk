nodeModulePipeline {
    squad = "squad-fed"
    name = "wch-flux-sdk"
    channel = "#infra-rtp-buildoutput"
    deploymentScript = "date"
    skipSonarQubeScan = true
    postBuildScript = "chmod +x npm_publish.sh && ./npm_publish.sh ${this.env.BRANCH_NAME}"
    nodeversion = "10"
    version_minor = "4"
    version_major = "1"
}