const CronJob = require('cron').CronJob;
const Discord = require("discord.js");
const moment = require('moment');
const md5 = require('md5');
const r = require('rethinkdbdash')({
  host: 'localhost',
  db: 'crowfallData',
  timeout: 30
});
const scrapeIt = require("scrape-it");

const Scrape = () => {
  scrapeIt("https://crowfall.com/en/news/articles/", {
      articles: {
        listItem: ".box-item",
        data: {
          // Get the article date and convert it into a Date object
          date: {
            selector: "p.caption-label",
            convert: x => new Date(x)
          },
          // Get the title
          title: {
            selector: "span.full"
          },
          link: {
            selector: "a",
            attr: "href"
          },
          //get image url
          image: {
            selector: "img",
            attr: "src"
          },
          content: {
            selector: "p",
            eq: 1,
            how: "html"
          }
        }
      }
    }).then(({
      data,
      response
    }) => {
      //limit responses to n-1 items
      //last response contains irregular "javascript.void" function for link
      for (i = 0; i < data.articles.length - 1; i++) {
        let articleLink = `https://crowfall.com${data.articles[i].link}`,
          articleDate = data.articles[i].date,
          articleContent = data.articles[i].content,
          articleTitle = data.articles[i].title,
          articleImage = `https:${data.articles[i].image}`;
        r.table("socialTracker")
          .insert({
            id: md5(data.articles[i].link),
            data_type: "news", //official crowfall articles only
            content: articleContent,
            date: articleDate,
            title: articleTitle,
            url: articleLink,
            image: articleImage //need to download and store if we plan on using these x-site transfers will be blocked
          }, {
            conflict: "update"
          })
          .run()
          .then(results => {
            if (results.inserted > 0) {
              console.log(`Crowfall Article Discovered: "${articleTitle}"`)
              //create a message for our discord bot
              let newEmbed = new Discord.MessageEmbed();
              newEmbed.setAuthor(`The Malekai Project`, `https://malekai.org/images/MalekaiBot-Avatar.png`, `https://malekai.org`);
              newEmbed.setColor([255, 255, 255]);
              newEmbed.setFooter(`https://malekai.org/`);
              newEmbed.setTimestamp();
              newEmbed.setTitle(`Crowfall Announces '${articleTitle}'`);
              newEmbed.setDescription(`${articleContent}\n${articleLink}`);
              if (articleImage) newEmbed.setImage(`${articleImage}`);
              r.table("messageQueue")
                .insert({
                  subscription: "news",
                  message: "",
                  embed: newEmbed
                })
                .run()
                .catch(err => console.warn(err))
            }
            if (results.replaced > 0)
              console.log(`Crowfall Article Updated: "${articleTitle}"`)
          })
          .catch(err => console.warn(err))
      }
    })
    .catch(err => console.warn(err))
}
Scrape();
//run this sucker every 15 minutes (this shit never updates, but I dont want to be more than 15 minutes late to the party)
//negligble server strain, will seem as normal web traffic refreshing every 15 min.

let job = new CronJob({
  //run every night at midnight
  cronTime: '*/15 * * * *',
  onTick: function() {
    Scrape();
    console.log(`malekaiNews ran at ${moment()}`);
  },
  start: true,
  timeZone: 'America/Chicago'
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
  process.exit();
});