Branches:
dev = daily development
beta = stable testing/default branch
production = final release

Deploy:
dev = automatic
beta = manual GitHub Action
production = manual GitHub Action

VPS:
/home/goliath/dev
/home/goliath/beta
/home/goliath/production

PM2:
goliath-dev
goliath-beta
goliath-production

npm run sync:dev
npm run promote:beta
npm run promote:production

tree /F > structure.txt
tree src /F > src-structure.txt

/home/goliath/dev
/home/goliath/beta
/home/goliath/production