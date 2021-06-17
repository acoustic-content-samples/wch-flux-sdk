#!/bin/bash

# exit the script if any task exits with a non zero value
set -e

echo "Publishing wch-flux-sdk:$VERSION_STRING package to https://artifactory.acoustic.co/artifactory/api/npm/content-npm-virtual/"

if [ $1 == 'master' ]
then
 npm version $VERSION_STRING --no-git-tag-version
 npm publish
 NEW_VERSION="$(npm view wch-flux-sdk version)"
 echo "Package version ${NEW_VERSION} is published."
else
 echo "Starting branch publish with tag"
 git add . && git commit -m "commit branch build"
 npm version $VERSION_STRING --allow-same-version
 npm publish --tag $1
fi