import { envBasedName, messageToJson, Worker } from './worker';
import { Comment, SourceDisplay } from '../entity';
import { fetchUser, pickImageUrl } from '../common';
import {
  baseNotificationEmailData,
  sendEmail,
  truncatePost,
} from '../common/mailing';

interface Data {
  commentId: string;
}

const worker: Worker = {
  topic: 'comment-featured',
  subscription: envBasedName('comment-featured-mail'),
  handler: async (message, con, logger): Promise<void> => {
    const data: Data = messageToJson(message);
    try {
      const comment = await con
        .getRepository(Comment)
        .findOne(data.commentId, { relations: ['post'] });
      const user = await fetchUser(comment.userId);
      const post = await comment.post;
      const display = await con
        .getRepository(SourceDisplay)
        .findOne({ sourceId: post.sourceId });
      await sendEmail({
        ...baseNotificationEmailData,
        to: user.email,
        templateId: 'd-5888ea6c1baf482b9373fba25f0363ea',
        dynamicTemplateData: {
          /* eslint-disable @typescript-eslint/camelcase */
          post_title: truncatePost(post),
          published_at: post.createdAt.toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
          }),
          profile_image: user.image,
          source_image: display.image,
          post_image: post.image || pickImageUrl(post),
          profile_link: user.permalink,
          /* eslint-enable @typescript-eslint/camelcase */
        },
      });
      logger.info(
        {
          data,
          messageId: message.id,
        },
        'featured email sent',
      );
      message.ack();
    } catch (err) {
      logger.error(
        {
          data,
          messageId: message.id,
          err,
        },
        'failed to send featured mail',
      );
      message.ack();
    }
  },
};

export default worker;
