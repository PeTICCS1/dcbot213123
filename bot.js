'use strict';

const Discord = require('discord.js');
// const fetch = require('node-fetch');
const fetchTimeout = require('fetch-timeout');
const { paddedFullWidth, errorWrap } = require('./utils.js');

if (Discord.version.startsWith('12.')) {
  // rename functions for compatibilities sake while testing
  Discord.RichEmbed = Discord.MessageEmbed;
  Discord.TextChannel.prototype.fetchMessage = function(snowflake) { // not perfect but whatevs
    return this.messages.fetch.apply(this.messages,[snowflake]);
    // return new Promise((resolve,reject) => {
    //   let message = this.messages.fetch(snowflake);
    //   if (message === undefined) reject(notfound);
    //   else resolve(message);
    // })
  }
  Object.defineProperty(Discord.User.prototype,'displayAvatarURL',{
    'get': function() {
      return this.avatarURL();
    }
  })
  // Object.defineProperty(Discord.GuildMember.prototype,'voiceChannelID',{
  //   'get': function() {
  //     if (this.voiceStates.size > 0) {
  //       var channelID;
  //       for (let id in this.voiceStates) {
  //         channelID =  this.voiceStates[id].channel.id;
  //         console.log(this.voiceStates[id].channel);
  //       }
  //       return channelID;
  //     }
  //     return undefined;
  //   }
  // })
}

const LOG_LEVELS = {
  'ERROR': 3,
  'INFO': 2,
  'DEBUG': 1,
  'SPAM': 0
}

const BOT_CONFIG = {
  'apiRequestMethod': 'sequential',
  'messageCacheMaxSize': 50,
  'messageCacheLifetime': 0,
  'messageSweepInterval': 0,
  'fetchAllMembers': false,
  'disableEveryone': true,
  'sync': false,
  'restWsBridgeTimeout': 5000, // check these
  'restTimeOffset': 300,
  'disabledEvents': [
    'CHANNEL_PINS_UPDATE',
    'TYPING_START'
  ],
  'ws': {
    'large_threshold': 100,
    'compress': true
  }
}

const USER_AGENT = `Roofstad bot ${require('./package.json').version} , Node ${process.version} (${process.platform}${process.arch})`;

exports.start = function(SETUP) {
  const URL_SERVER = SETUP.URL_SERVER;

  const URL_PLAYERS = new URL('/players.json',SETUP.URL_SERVER).toString();
  const URL_INFO = new URL('/info.json',SETUP.URL_SERVER).toString();
  const MAX_PLAYERS = 128;
  const TICK_MAX = 1 << 9; // max bits for TICK_N
  const FETCH_TIMEOUT = 900;
  const FETCH_OPS = {
    'cache': 'no-cache',
    'method': 'GET',
    'headers': { 'User-Agent': USER_AGENT }
  };

  const LOG_LEVEL = SETUP.LOG_LEVEL !== undefined ? parseInt(SETUP.LOG_LEVEL) : LOG_LEVELS.INFO;
  const BOT_TOKEN = SETUP.BOT_TOKEN;
  const CHANNEL_ID = SETUP.CHANNEL_ID;
  const MESSAGE_ID = SETUP.MESSAGE_ID;
  const SUGGESTION_CHANNEL = SETUP.SUGGESTION_CHANNEL;
  const BUG_CHANNEL = SETUP.BUG_CHANNEL;
  const BUG_LOG_CHANNEL = SETUP.BUG_LOG_CHANNEL;
  const LOG_CHANNEL = SETUP.LOG_CHANNEL;
  const STREAM_URL = SETUP.STREAM_URL;
  const STREAM_CHANNEL = SETUP.STREAM_CHANNEL;
  const UPDATE_TIME = 2500; // in ms

  var TICK_N = 0;
  var MESSAGE;
  var LAST_COUNT;
  var STATUS;

  var STREAM_DISPATCHER = undefined;

  var loop_callbacks = []; // for testing whether loop is still running

  const log = function(level,message) {
    if (level >= LOG_LEVEL) console.log(`${new Date().toLocaleString()} :${level}: ${message}`);
  };

  const getPlayers = function() {
    return new Promise((resolve,reject) => {
      fetchTimeout(URL_PLAYERS,FETCH_OPS,FETCH_TIMEOUT).then((res) => {
        res.json().then((players) => {
          resolve(players);
        }).catch(reject);
      }).catch(reject);
    })
  };

  const getVars = function() {
    return new Promise((resolve,reject) => {
      fetchTimeout(URL_INFO,FETCH_OPS,FETCH_TIMEOUT).then((res) => {
        res.json().then((info) => {
          resolve(info.vars);
        }).catch(reject);
      }).catch(reject);
    });
  };

  const bot = new Discord.Client(BOT_CONFIG);

  const sendOrUpdate = function(embed) {
    if (MESSAGE !== undefined) {
      MESSAGE.edit(embed).then(() => {
        log(LOG_LEVELS.DEBUG,'Sikeres Friss??t??s!');
      }).catch(() => {
        log(LOG_LEVELS.ERROR,'Sikertelen Friss??t??s!');
      })
    } else {
      let channel = bot.channels.get(CHANNEL_ID);
      if (channel !== undefined) {
        channel.fetchMessage(MESSAGE_ID).then((message) => {
          MESSAGE = message;
          message.edit(embed).then(() => {
            log(LOG_LEVELS.SPAM,'A Friss??t??s Sikeres!');
          }).catch(() => {
            log(LOG_LEVELS.ERROR,'A Friss??t??s Sikertelen!');
          });
        }).catch(() => {
          channel.send(embed).then((message) => {
            MESSAGE = message;
            log(LOG_LEVELS.INFO,`Az ??zenet le lett k??ldve; (${message.id})`);
          }).catch(console.error);
        })
      } else {
        log(LOG_LEVELS.ERROR,'Nincs Friss??t??si szoba be??ll??tva!');
      }
    }
  };

  const UpdateEmbed = function() {
    let dot = TICK_N % 2 === 0 ? 'Nirvana' : 'Roleplay';
    let embed = new Discord.RichEmbed()
    .setAuthor("Nirvana RolePlay RolePlay St??tusz", "https://cdn.discordapp.com/attachments/1061307399610302584/1061313266594353212/logo.jpg")
    .setColor(0x2894C2)
    .setFooter(TICK_N % 2 === 0 ? '??? Nirvana RolePlay' : '??? Nirvana RolePlay')
    .setTimestamp(new Date())
    .addField("Inform??ci??k:", `???`)
    .addField("Amennyiben ??gy ??rzed szeretn??l egy kedves, ??sszetart?? csapattal j??tszani,", `**Akkor itt az ideje hogy fel csatlakozz a szerver??nkre!**`)
    .addField("Discord Szerver Link:", `https://discord.gg/nirvanaroleplay`)
    .addField("Ha te is csatlakozni szeretn??l a szerver k??z??ss??g??hez,", `FiveM szerver keres?? -> Nirvana RolePlay`)
    if (STATUS !== undefined)
    {
      embed.addField(':warning: Szerver st??tusz:',`${STATUS}\n\u200b\n`);
      embed.setColor(0xff5d00)
    }
    return embed;
  };

  const offline = function() {
    log(LOG_LEVELS.SPAM,Array.from(arguments));
    if (LAST_COUNT !== null) log(LOG_LEVELS.INFO,`A Szerver Offline ??llapotban van. ${URL_SERVER} (${URL_PLAYERS} ${URL_INFO})`);
    let embed = UpdateEmbed()
    .setColor(0xff0000)
    .addField('Szerver St??tusz:',':exclamation: A Szerver Nem El??rhet??! :exclamation: ',true)
    .addField('V??r??lista:',':x:',true)
    .addField('El??rhet?? J??t??kosok:',':x:\n\u200b\n',true);
    sendOrUpdate(embed);
    LAST_COUNT = null;
  };

  const updateMessage = function() {
    getVars().then((vars) => {
      getPlayers().then((players) => {
        if (players.length !== LAST_COUNT) log(LOG_LEVELS.INFO,`${players.length} playerek`);
        let queue = vars['Queue'];
        let embed = UpdateEmbed()
        .addField('Szerver St??tusz:',':white_check_mark: El??rhet??',true)
        .addField('V??r??lista:',queue === 'Bekapcsolva' || queue === undefined ? '0' : queue.split(':')[1].trim(),true)
        .addField('El??rhet?? J??t??kosok:',`${players.length}/${MAX_PLAYERS}\n\u200b\n`,true);
        // .addField('\u200b','\u200b\n\u200b\n',true);
        if (players.length > 0) {
          // method D
          const fieldCount = 3;
          const fields = new Array(fieldCount);
          fields.fill('');
          // for (var i=0;i<players.length;i++) {
          //   fields[i%4 >= 2 ? 1 : 0] += `${players[i].name}${i % 2 === 0 ? '\u200e' : '\n\u200f'}`;
          // }
          fields[0] = `**El??rhet?? j??t??kosok:**\n`;
          for (var i=0;i<players.length;i++) {
            fields[(i+1)%fieldCount] += `${players[i].name.substr(0,20)}\n`; // first 12 characters of players name
          }
          for (var i=0;i<fields.length;i++) {
            let field = fields[i];
            if (field.length > 0) embed.addField('\u200b',field,true);
          }

          // method A
          // let maxLen = 8;
          // var text = '';
          // for (var i=0;i<players.length;i++) {
          //   var eol = false;
          //   if ((i+1) % 3 === 0) eol = true;
          //   text += paddedFullWidth(players[i].name,eol ? players[i].name.length : maxLen);
          //   if (eol) text += '\n';
          // }
          // embed.addField('Spelers',`**${text}**`,false);

          // method B
          // embed.addField('Spelers','\u200b',false);
          // for (var player of players) {
          //   embed.addField('\u200b',player.name,true);
          // }
          // for (var i=0;i<3-(players.length%3);i++) {
          //   embed.addField('\u200b','\u200b',false);
          // }

          // method C
          // let playerNames = Array.from(players.values()).map((c) => `**${c.name}**`).join(', ');
          // embed.addField('Spelers',playerNames,false);
        }
        sendOrUpdate(embed);
        LAST_COUNT = players.length;
      }).catch(offline);
    }).catch(offline);
    TICK_N++;
    if (TICK_N >= TICK_MAX) {
      TICK_N = 0;
    }
    for (var i=0;i<loop_callbacks.length;i++) {
      let callback = loop_callbacks.pop(0);
      callback();
    }
  };

  bot.on('ready',() => {
    log(LOG_LEVELS.INFO,'A BOT Elindult');
    // bot.user.setGame('Roofstad', 'https://www.twitch.tv/RoqueTV');
    bot.user.setActivity('Nirvana RolePlay',{'url':'https://www.youtube.com/@ZalanRithnovszky','type':'STREAMING'});
    bot.generateInvite(['ADMINISTRATOR']).then((link) => {
      log(LOG_LEVELS.INFO,`Invite URL - ${link}`);
    }).catch(null);
    bot.setInterval(updateMessage, UPDATE_TIME);
    // use VoiceBroadcasts for multiple channels
  });

  function checkLoop() {
    return new Promise((resolve,reject) => {
      var resolved = false;
      let id = loop_callbacks.push(() => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        } else {
          log(LOG_LEVELS.ERROR,'Loop Callback Id??tull??p??s');
          reject(null);
        }
      })
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      },3000);
    })
  }

  bot.on('debug',(info) => {
    log(LOG_LEVELS.SPAM,info);
  })

  bot.on('error',(error,shard) => {
    log(LOG_LEVELS.ERROR,error);
  })

  bot.on('warn',(info) => {
    log(LOG_LEVELS.DEBUG,info);
  })

  bot.on('Lecsatlakozott',(devent,shard) => {
    log(LOG_LEVELS.INFO,'Lecsatlakozott');
    checkLoop().then((running) => {
      log(LOG_LEVELS.INFO,`A loop m??k??d??se: ${running}`);
    }).catch(console.error);
  })

  bot.on('??jracsatlakoz??s',(shard) => {
    log(LOG_LEVELS.INFO,'??jracsatlakoz??s');
    checkLoop().then((running) => {
      log(LOG_LEVELS.INFO,`A loop m??k??d??se: ${running}`);
    }).catch(console.error);
  })

  bot.on('Folyat??s',(replayed,shard) => {
    log(LOG_LEVELS.INFO,`Innen folytatja: (${replayed})`);
    checkLoop().then((running) => {
      log(LOG_LEVELS.INFO,`A loop m??k??d??se: ${running}`);
    }).catch(console.error);
  })

  bot.on('rateLimit',(info) => {
    log(LOG_LEVELS.INFO,`Rate limit ${info.timeDifference ? info.timeDifference : info.timeout ? info.timeout : 'Ismeretlen '}ms (${info.path} / ${info.requestLimit ? info.requestLimit : info.limit ? info.limit : 'Unkown limit'})`);
    if (info.path.startsWith(`/channels/${CHANNEL_ID}/messages/${MESSAGE_ID ? MESSAGE_ID : MESSAGE ? MESSAGE.id : ''}`)) bot.emit('??jraind??t??s');
    checkLoop().then((running) => {
      log(LOG_LEVELS.DEBUG,`A loop m??k??d??se: ${running}`);
    }).catch(console.error);
  })
  
  bot.on('message', async function (msg) {
    if (msg.channel.id === '586631869928308743') {
        await msg.react(bot.emojis.get('587057796936368128'));
        await msg.react(bot.emojis.get('595353996626231326'));
    }
});

  bot.on('message',(message) => {
    if (!message.author.bot) {
      if (message.member) {
        if (message.member.hasPermission('ADMINISTRATOR')) {
          if (message.content.startsWith('+status ')) {
            let status = message.content.substr(7).trim();
            let embed =  new Discord.RichEmbed()
            .setAuthor(message.member.nickname ? message.member.nickname : message.author.tag,message.author.displayAvatarURL)
            .setColor(0x2894C2)
            .setTitle('St??tusz friss??tve!')
            .setTimestamp(new Date());
            if (status === 'clear') {
              STATUS = undefined;
              embed.setDescription('A st??tusz t??rl??sre ker??lt!');
            } else {
              STATUS = status;
              embed.setDescription(`??j el??rhet?? st??tusz:\n\`\`\`${STATUS}\`\`\``);
            }
            bot.channels.get(LOG_CHANNEL).send(embed);
            return log(LOG_LEVELS.INFO,`${message.author.username} friss??tette a st??tuszt!`);
          }
        }
        if (message.channel.id === SUGGESTION_CHANNEL) {
          let embed = new Discord.RichEmbed()
          .setAuthor(message.member.nickname ? message.member.nickname : message.author.tag,message.author.displayAvatarURL)
          .setColor(0x2894C2)
          .setTitle('??tlet')
          .setDescription(message.content)
          .setTimestamp(new Date());
          message.channel.send(embed).then((message) => {
            const sent = message;
            sent.react('????').then(() => {
              sent.react('????').then(() => {
                log(LOG_LEVELS.SPAM,'Egy ??tlet elk??ld??sre ker??lt!');
              }).catch(console.error);
            }).catch(console.error);
          }).catch(console.error);
          return message.delete();
        }
        if (message.channel.id === BUG_CHANNEL) {
          let embedUser = new Discord.RichEmbed()
          .setAuthor(message.member.nickname ? message.member.nickname : message.author.tag,message.author.displayAvatarURL)
          .setColor(0x2894C2)
          .setTitle('Hiba jelent??s')
          .setDescription('A hiba jelent??sedet r??gz??tett??k!')
          .setTimestamp(new Date());
          let embedStaff = new Discord.RichEmbed()
          .setAuthor(message.member.nickname ? message.member.nickname : message.author.tag,message.author.displayAvatarURL)
          .setColor(0x2894C2)
          .setTitle('Hiba jelent??s')
          .setDescription(message.content)
          .setTimestamp(new Date());
          message.channel.send(embedUser).then(null).catch(console.error);
          bot.channels.get(BUG_LOG_CHANNEL).send(embedStaff).then(null).catch(console.error);
          return message.delete();
        }
      }
    }
  });

  bot.login(BOT_TOKEN).then(null).catch(() => {
    log(LOG_LEVELS.ERROR,'Sikertelen csatlakoz??s, pr??b??ld ??jra!');
    console.error(e);
    process.exit(1);
  });

  return bot;
}
